import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, QuerySnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";
import { createOperationalJson } from "./operationsOpenai.js";
import { logOperationalEvent } from "./operationalEvents.js";

type PromokitLineItem = {
  name: string;
  quantity: number;
  price: number;
  total: number;
  promokitItemId: string;
  promokitProductId: string;
  pdvCode: string;
  detailsText: string;
  raw: any;
};

type PromokitSelectedProduct = {
  name: string;
  quantity: number;
  raw: any;
};

type ResolvedSelectedProduct = {
  productId: string;
  quantity: number;
  name: string;
};

type AiKitInterpretation = {
  selectedProducts: { produto: string; quantidade: number }[];
  substitutions: { remover: string; adicionar: string; quantidade: number }[];
  confidence: number;
  reason: string;
};

type ProcessOrderResult = {
  code: string;
  saleId: string | null;
  createdSale: boolean;
  movementCount: number;
  syncedProductCount: number;
};

type ProcessOrderOptions = {
  forceReprocess?: boolean;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getOrderCode(order: any) {
  return String(order?.codigo || order?.code || order?.id || "");
}

function getOrderDate(order: any) {
  const date = order?.horario ? new Date(order.horario) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getCustomerName(order: any) {
  return order?.cliente?.nome || order?.customerName || "Cliente Promokit";
}

function extractPdvCode(product: any) {
  return String(
    product?.codigoPdv ||
      product?.codigoPDV ||
      product?.codigo_pdv ||
      product?.codigoNoPdv ||
      product?.codigo ||
      product?.pdvCode ||
      ""
  );
}

function extractLineItems(order: any): PromokitLineItem[] {
  const items = Array.isArray(order?.itens) ? order.itens : [];

  return items
    .map((item: any) => {
      const product = item?.produto || {};
      const name = String(item?.nome || product?.nome || "").trim();
      const quantity = Number(item?.qtde || item?.quantidade || item?.quantity || 1);
      const price = Number(item?.valor ?? product?.preco ?? 0);
      const total = Number(item?.total ?? price * quantity);
      const detailsText = buildDetailsText(item);

      return {
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        price: Number.isFinite(price) ? price : 0,
        total: Number.isFinite(total) ? total : 0,
        promokitItemId: String(item?.id || ""),
        promokitProductId: String(product?.id || item?.produtoId || ""),
        pdvCode: extractPdvCode(product),
        detailsText,
        raw: item,
      };
    })
    .filter((item) => item.name);
}

function readName(value: any) {
  if (!value || typeof value !== "object") return "";
  return String(
    value?.nome ||
      value?.name ||
      value?.titulo ||
      value?.title ||
      value?.descricao ||
      value?.description ||
      value?.produto?.nome ||
      value?.item?.nome ||
      ""
  ).trim();
}

function readQuantity(value: any) {
  const quantity = Number(value?.qtde || value?.quantidade || value?.quantity || value?.qtd || 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function buildDetailsText(value: any, depth = 0, found: string[] = []) {
  if (!value || depth > 4) return found.join("\n");

  if (typeof value === "string") {
    const text = value.trim();
    if (text && text.length <= 2000 && !found.includes(text)) found.push(text);
    return found.join("\n");
  }

  if (typeof value !== "object") return found.join("\n");

  if (Array.isArray(value)) {
    value.forEach((entry) => buildDetailsText(entry, depth + 1, found));
    return found.join("\n");
  }

  Object.entries(value).forEach(([key, entry]) => {
    const normalizedKey = normalizeText(key);
    const isRelevantTextField = [
      "observacao",
      "observacoes",
      "obs",
      "comentario",
      "comentarios",
      "note",
      "notes",
      "description",
      "descricao",
      "nome",
      "name",
      "titulo",
      "title",
      "opcao",
      "opcoes",
      "adicional",
      "adicionais",
      "complemento",
      "complementos",
      "escolha",
      "escolhas",
      "resposta",
      "respostas",
      "variacao",
      "variacoes",
      "itens",
      "items",
    ].some((candidate) => normalizedKey.includes(candidate));

    if (typeof entry === "string" || typeof entry === "number") {
      if (!isRelevantTextField) return;
      const text = String(entry).trim();
      if (text && text.length <= 2000 && !found.includes(text)) found.push(text);
      return;
    }

    if (entry && typeof entry === "object") buildDetailsText(entry, depth + 1, found);
  });

  return found.join("\n");
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

function findProductsExplicitlyListedInDetails(lineItem: PromokitLineItem, productsSnapshot: QuerySnapshot) {
  const normalizedDetails = normalizeText(lineItem.detailsText);
  if (!normalizedDetails) return [];

  const consumedRanges: { start: number; end: number }[] = [];
  const matchedByProduct = new Map<string, ResolvedSelectedProduct>();
  const candidates = productsSnapshot.docs
    .map((doc) => ({
      doc,
      name: String(doc.data().name || ""),
      normalizedName: normalizeText(String(doc.data().name || "")),
    }))
    .filter((candidate) => candidate.normalizedName.length > 8)
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  candidates.forEach((candidate) => {
    const productPattern = candidate.normalizedName.split(" ").filter(Boolean).join("\\s+");
    if (!productPattern) return;

    const pattern = new RegExp(`(?:^|\\s)(\\d+)\\s*x\\s+${productPattern}(?=\\s|$)`, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(normalizedDetails)) !== null) {
      const quantity = Number(match[1] || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const matchStart = match.index + match[0].indexOf(match[1]);
      const matchEnd = pattern.lastIndex;
      const range = { start: matchStart, end: matchEnd };
      if (consumedRanges.some((consumedRange) => rangesOverlap(range, consumedRange))) continue;

      consumedRanges.push(range);
      const current = matchedByProduct.get(candidate.doc.ref.id);
      matchedByProduct.set(candidate.doc.ref.id, {
        productId: candidate.doc.ref.id,
        quantity: (current?.quantity || 0) + quantity,
        name: candidate.name,
      });
    }
  });

  return [...matchedByProduct.values()];
}

function collectNestedSelectedProducts(value: any, parentName: string, found: PromokitSelectedProduct[] = []) {
  if (!value || typeof value !== "object") return found;

  if (Array.isArray(value)) {
    value.forEach((entry) => collectNestedSelectedProducts(entry, parentName, found));
    return found;
  }

  const name = readName(value);
  const normalizedName = normalizeText(name);
  const normalizedParent = normalizeText(parentName);
  const hasNestedProductShape = Boolean(
    name &&
      normalizedName !== normalizedParent &&
      (value?.produto ||
        value?.item ||
        value?.produtoId ||
        value?.idProduto ||
        value?.codigoPdv ||
        value?.codigoPDV ||
        value?.opcao ||
        value?.adicional ||
        value?.complemento ||
        value?.escolha)
  );

  if (hasNestedProductShape) {
    found.push({
      name,
      quantity: readQuantity(value),
      raw: value,
    });
  }

  Object.entries(value).forEach(([key, entry]) => {
    if (["produto", "item"].includes(key) && name) return;
    if (entry && typeof entry === "object") collectNestedSelectedProducts(entry, parentName, found);
  });

  return found;
}

function scoreCandidate(candidate: string, query: string, sourceText: string) {
  const candidateTokens = normalizeText(candidate).split(" ").filter((token) => token.length > 2);
  const queryText = `${normalizeText(query)} ${normalizeText(sourceText)}`;
  return candidateTokens.reduce((score, token) => score + (queryText.includes(token) ? 1 : 0), 0);
}

function findProductDocByName(productsSnapshot: QuerySnapshot, name: string, sourceText = "") {
  const selectedName = normalizeText(name);
  if (!selectedName) return null;

  const exact = productsSnapshot.docs.find((doc) => normalizeText(String(doc.data().name || "")) === selectedName);
  if (exact) return exact;

  const partial = productsSnapshot.docs.find((doc) => {
    const productName = normalizeText(String(doc.data().name || ""));
    return productName.includes(selectedName) || selectedName.includes(productName);
  });
  if (partial) return partial;

  const ranked = productsSnapshot.docs
    .map((doc) => ({
      doc,
      score: scoreCandidate(String(doc.data().name || ""), name, sourceText),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score ? ranked[0].doc : null;
}

async function findProductsSelectedInsideKit(
  lineItem: PromokitLineItem,
  productsSnapshot: QuerySnapshot
) {
  const selectedProducts = collectNestedSelectedProducts(lineItem.raw, lineItem.name);
  const matched: ResolvedSelectedProduct[] = [];

  selectedProducts.forEach((selected) => {
    const productDoc = findProductDocByName(productsSnapshot, selected.name, lineItem.detailsText);
    if (!productDoc) return;
    matched.push({
      productId: productDoc.ref.id,
      quantity: selected.quantity,
      name: selected.name,
    });
  });

  return matched;
}

function isCustomKitLineItem(lineItem: PromokitLineItem) {
  const text = normalizeText(`${lineItem.name} ${lineItem.detailsText}`);
  return (
    text.includes("monte seu kit") ||
    text.includes("monte o seu kit") ||
    text.includes("monte") ||
    text.includes("personaliz") ||
    text.includes("escolha suas") ||
    text.includes("kit livre")
  );
}

function kitCompositionText(kitItems: any[], productsSnapshot: QuerySnapshot) {
  return kitItems
    .map((kitItem) => {
      const productName =
        productsSnapshot.docs.find((doc) => doc.ref.id === kitItem.productId)?.data()?.name || kitItem.productName || kitItem.name;
      return productName ? `${kitItem.quantity || 1}x ${productName}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

const aiKitInterpretationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["selectedProducts", "substitutions", "confidence", "reason"],
  properties: {
    selectedProducts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["produto", "quantidade"],
        properties: {
          produto: { type: "string" },
          quantidade: { type: "number" },
        },
      },
    },
    substitutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["remover", "adicionar", "quantidade"],
        properties: {
          remover: { type: "string" },
          adicionar: { type: "string" },
          quantidade: { type: "number" },
        },
      },
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
};

async function interpretKitDetailsWithAi({
  lineItem,
  kitItems,
  productsSnapshot,
}: {
  lineItem: PromokitLineItem;
  kitItems: any[];
  productsSnapshot: QuerySnapshot;
}): Promise<AiKitInterpretation> {
  const details = lineItem.detailsText.trim();
  const productNames = productsSnapshot.docs.map((doc) => String(doc.data().name || "")).filter(Boolean);

  if (!details || !process.env.OPENAI_API_KEY) {
    return { selectedProducts: [], substitutions: [], confidence: 0, reason: "Sem detalhes ou chave OpenAI indisponivel." };
  }

  try {
    const result = await createOperationalJson<AiKitInterpretation>({
      schemaName: "promokit_kit_details",
      schema: aiKitInterpretationSchema,
      maxOutputTokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Interprete os detalhes de um item vendido pela Promokit para baixa de estoque.

ITEM PROMOKIT: ${lineItem.quantity}x ${lineItem.name}
DETALHES/OBSERVACOES/OPCOES RECEBIDAS:
${details}

COMPOSICAO LOCAL DO KIT, se existir:
${kitCompositionText(kitItems, productsSnapshot) || "Nao cadastrada"}

CARDAPIO PERMITIDO DE MARMITAS:
${productNames.join(", ")}

Regras:
1. Use selectedProducts quando os detalhes mostram quais marmitas foram escolhidas no kit.
2. Use substitutions quando o texto pede troca, exemplo: trocar X por Y.
3. Em substitutions, remover e adicionar devem ser nomes do CARDAPIO PERMITIDO.
4. Se nao houver escolha nem troca clara, deixe arrays vazios e confidence baixo.
5. Nunca invente produto fora do cardapio.`,
            },
          ],
        },
      ],
    });

    return {
      selectedProducts: Array.isArray(result.selectedProducts) ? result.selectedProducts : [],
      substitutions: Array.isArray(result.substitutions) ? result.substitutions : [],
      confidence: Number(result.confidence || 0),
      reason: String(result.reason || ""),
    };
  } catch (error) {
    console.error("Promokit kit AI interpretation failed", {
      error: error instanceof Error ? error.message : "Unknown AI error",
      item: lineItem.name,
    });
    return { selectedProducts: [], substitutions: [], confidence: 0, reason: "Falha ao interpretar com IA." };
  }
}

function resolveAiSelectedProducts(
  interpretation: AiKitInterpretation,
  lineItem: PromokitLineItem,
  productsSnapshot: QuerySnapshot
) {
  return interpretation.selectedProducts
    .map((selected) => {
      const productDoc = findProductDocByName(productsSnapshot, selected.produto, lineItem.detailsText);
      const quantity = Number(selected.quantidade || 0);
      if (!productDoc || !Number.isFinite(quantity) || quantity <= 0) return null;

      return {
        productId: productDoc.ref.id,
        quantity,
        name: selected.produto,
      };
    })
    .filter(Boolean) as ResolvedSelectedProduct[];
}

function applyAiSubstitutions({
  interpretation,
  kitItems,
  lineItem,
  productsSnapshot,
}: {
  interpretation: AiKitInterpretation;
  kitItems: any[];
  lineItem: PromokitLineItem;
  productsSnapshot: QuerySnapshot;
}) {
  const resolved = new Map<string, ResolvedSelectedProduct>();

  kitItems.forEach((kitItem) => {
    const quantity = Number(kitItem.quantity || 0);
    if (!kitItem.productId || !Number.isFinite(quantity) || quantity <= 0) return;
    const productDoc = productsSnapshot.docs.find((doc) => doc.ref.id === kitItem.productId);
    resolved.set(kitItem.productId, {
      productId: kitItem.productId,
      quantity,
      name: String(productDoc?.data()?.name || kitItem.productName || kitItem.name || ""),
    });
  });

  interpretation.substitutions.forEach((substitution) => {
    const removeDoc = findProductDocByName(productsSnapshot, substitution.remover, lineItem.detailsText);
    const addDoc = findProductDocByName(productsSnapshot, substitution.adicionar, lineItem.detailsText);
    const quantity = Math.max(1, Number(substitution.quantidade || 1));

    if (removeDoc) {
      const current = resolved.get(removeDoc.ref.id);
      if (current) {
        const nextQuantity = Math.max(0, current.quantity - quantity);
        if (nextQuantity > 0) resolved.set(removeDoc.ref.id, { ...current, quantity: nextQuantity });
        else resolved.delete(removeDoc.ref.id);
      }
    }

    if (addDoc) {
      const current = resolved.get(addDoc.ref.id);
      resolved.set(addDoc.ref.id, {
        productId: addDoc.ref.id,
        quantity: (current?.quantity || 0) + quantity,
        name: substitution.adicionar,
      });
    }
  });

  return [...resolved.values()].filter((item) => item.quantity > 0);
}

async function findProduct(lineItem: PromokitLineItem) {
  const db = getAdminDb();
  const productsRef = db.collection("products");

  if (lineItem.promokitProductId) {
    const byPromokitId = await productsRef.where("promokitProductId", "==", lineItem.promokitProductId).limit(1).get();
    if (!byPromokitId.empty) return byPromokitId.docs[0];
  }

  if (lineItem.pdvCode) {
    const byPdvCode = await productsRef.where("promokitPdvCode", "==", lineItem.pdvCode).limit(1).get();
    if (!byPdvCode.empty) return byPdvCode.docs[0];
  }

  const normalizedName = normalizeText(lineItem.name);
  const byNormalizedName = await productsRef.where("normalizedName", "==", normalizedName).limit(1).get();
  if (!byNormalizedName.empty) return byNormalizedName.docs[0];

  const allProducts = await productsRef.get();
  return allProducts.docs.find((doc) => normalizeText(String(doc.data().name || "")) === normalizedName) || null;
}

async function findKit(lineItem: PromokitLineItem) {
  const db = getAdminDb();
  const normalizedName = normalizeText(lineItem.name);
  const kits = await db.collection("kits").get();

  return (
    kits.docs.find((doc) => normalizeText(String(doc.data().name || "")) === normalizedName) ||
    kits.docs.find((doc) => {
      const kitName = normalizeText(String(doc.data().name || ""));
      return kitName.includes(normalizedName) || normalizedName.includes(kitName);
    }) ||
    null
  );
}

async function upsertPromokitProduct(lineItem: PromokitLineItem) {
  const db = getAdminDb();
  const productDoc = await findProduct(lineItem);
  const normalizedName = normalizeText(lineItem.name);
  const productId = lineItem.promokitProductId || lineItem.pdvCode || normalizedName;

  const productData = {
    name: lineItem.name.toLowerCase(),
    normalizedName,
    price: lineItem.price,
    source: "promokit",
    promokitProductId: lineItem.promokitProductId || null,
    promokitPdvCode: lineItem.pdvCode || null,
    promokitName: lineItem.name,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection("promokit_products").doc(productId).set(
    {
      ...productData,
      lastSeenAt: FieldValue.serverTimestamp(),
      raw: lineItem.raw?.produto || lineItem.raw,
    },
    { merge: true }
  );

  if (productDoc) {
    await productDoc.ref.set(productData, { merge: true });
    return productDoc.ref.id;
  }

  const newProductRef = db.collection("products").doc();
  await newProductRef.set({
    ...productData,
    createdAt: FieldValue.serverTimestamp(),
  });

  return newProductRef.id;
}

async function saleAlreadyExists(code: string) {
  const db = getAdminDb();
  const existingSale = await db.collection("sales").where("promokitOrderCode", "==", code).limit(1).get();
  if (!existingSale.empty) return existingSale.docs[0].ref.id;

  const orderDoc = await db.collection("promokit_orders").doc(code).get();
  const processedSaleId = orderDoc.data()?.processedSaleId;
  return processedSaleId ? String(processedSaleId) : null;
}

async function deleteExistingPromokitSale(code: string) {
  const db = getAdminDb();
  const salesSnapshot = await db.collection("sales").where("promokitOrderCode", "==", code).get();
  const movementsByOrder = await db.collection("movements").where("promokitOrderCode", "==", code).get();
  const saleIds = new Set(salesSnapshot.docs.map((doc) => doc.ref.id));
  const movementRefs = new Map<string, DocumentReference>();

  movementsByOrder.docs.forEach((doc) => movementRefs.set(doc.ref.path, doc.ref));

  for (const saleId of saleIds) {
    const movementsBySale = await db.collection("movements").where("saleId", "==", saleId).get();
    movementsBySale.docs.forEach((doc) => movementRefs.set(doc.ref.path, doc.ref));
  }

  const batch = db.batch();
  salesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  movementRefs.forEach((ref) => batch.delete(ref));
  batch.set(
    db.collection("promokit_orders").doc(code),
    {
      processedSaleId: null,
      processingStatus: "reprocessing",
      reprocessedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

export async function processPromokitOrder(order: any, options: ProcessOrderOptions = {}): Promise<ProcessOrderResult | null> {
  const db = getAdminDb();
  const code = getOrderCode(order);
  if (!code) return null;

  if (options.forceReprocess) {
    await deleteExistingPromokitSale(code);
  } else {
    const existingSaleId = await saleAlreadyExists(code);
    if (existingSaleId) {
      return {
        code,
        saleId: existingSaleId,
        createdSale: false,
        movementCount: 0,
        syncedProductCount: 0,
      };
    }
  }

  if (order?.cancelado || String(order?.status || "").toLowerCase() === "cancelado") {
    await db.collection("promokit_orders").doc(code).set(
      {
        processedSaleId: null,
        processingStatus: "ignored_canceled",
        processedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      code,
      saleId: null,
      createdSale: false,
      movementCount: 0,
      syncedProductCount: 0,
    };
  }

  const lineItems = extractLineItems(order);
  const saleRef = db.collection("sales").doc();
  const batch = db.batch();
  const saleDate = Timestamp.fromDate(getOrderDate(order));
  let movementCount = 0;
  let totalQuantity = 0;
  let syncedProductCount = 0;
  let needsReview = false;
  const productsSnapshot = await db.collection("products").get();

  for (const lineItem of lineItems) {
    const kitDoc = await findKit(lineItem);

    if (kitDoc) {
      const kitData = kitDoc.data();
      const kitItems = Array.isArray(kitData.items) ? kitData.items : [];
      const promokitCatalogId = lineItem.promokitProductId || lineItem.pdvCode || normalizeText(lineItem.name);
      const explicitProducts = findProductsExplicitlyListedInDetails(lineItem, productsSnapshot);
      const nestedSelectedProducts = explicitProducts.length > 0 ? [] : await findProductsSelectedInsideKit(lineItem, productsSnapshot);
      const selectedProducts = explicitProducts.length > 0 ? explicitProducts : nestedSelectedProducts;
      const aiInterpretation =
        selectedProducts.length > 0
          ? {
              selectedProducts: [],
              substitutions: [],
              confidence: 0,
              reason: explicitProducts.length > 0
                ? "Promokit enviou as marmitas na descricao do item."
                : "Promokit enviou escolhas estruturadas.",
            }
          : await interpretKitDetailsWithAi({ lineItem, kitItems, productsSnapshot });
      const aiSelectedProducts = selectedProducts.length > 0 ? [] : resolveAiSelectedProducts(aiInterpretation, lineItem, productsSnapshot);
      const hasAiSubstitutions = aiInterpretation.substitutions.length > 0 && aiInterpretation.confidence >= 0.45;
      const selectedSourceProducts = selectedProducts.length > 0 ? selectedProducts : aiSelectedProducts;
      const selectedRecognitionSource =
        explicitProducts.length > 0
          ? "promokit_item_description"
          : selectedProducts.length > 0
            ? "promokit_kit_selection"
            : "ai_kit_observation";

      await db.collection("promokit_products").doc(promokitCatalogId).set(
        {
          name: lineItem.name.toLowerCase(),
          normalizedName: normalizeText(lineItem.name),
          price: lineItem.price,
          source: "promokit",
          linkedType: "kit",
          linkedId: kitDoc.ref.id,
          promokitProductId: lineItem.promokitProductId || null,
          promokitPdvCode: lineItem.pdvCode || null,
          promokitName: lineItem.name,
          lastSeenAt: FieldValue.serverTimestamp(),
          raw: lineItem.raw?.produto || lineItem.raw,
        },
        { merge: true }
      );
      await kitDoc.ref.set(
        {
          price: lineItem.price,
          source: "promokit",
          promokitProductId: lineItem.promokitProductId || null,
          promokitPdvCode: lineItem.pdvCode || null,
          promokitName: lineItem.name,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      syncedProductCount += 1;

      if (selectedSourceProducts.length > 0) {
        for (const selectedProduct of selectedSourceProducts) {
          const quantity = selectedProduct.quantity * lineItem.quantity;
          if (!selectedProduct.productId || quantity <= 0) continue;

          const movementRef = db.collection("movements").doc();
          batch.set(movementRef, {
            productId: selectedProduct.productId,
            type: "saida",
            quantity,
            referenceDate: saleDate,
            createdAt: FieldValue.serverTimestamp(),
            saleId: saleRef.id,
            source: "promokit",
            recognitionSource: selectedRecognitionSource,
            promokitOrderCode: code,
            promokitItemId: lineItem.promokitItemId || null,
            promokitProductId: lineItem.promokitProductId || null,
            promokitSelectedName: selectedProduct.name,
            promokitDetails: lineItem.detailsText || null,
            aiReason: selectedProducts.length > 0 ? null : aiInterpretation.reason,
          });
          movementCount += 1;
          totalQuantity += quantity;
        }
      } else if (hasAiSubstitutions) {
        const substitutedProducts = applyAiSubstitutions({
          interpretation: aiInterpretation,
          kitItems,
          lineItem,
          productsSnapshot,
        });

        for (const selectedProduct of substitutedProducts) {
          const quantity = selectedProduct.quantity * lineItem.quantity;
          if (!selectedProduct.productId || quantity <= 0) continue;

          const movementRef = db.collection("movements").doc();
          batch.set(movementRef, {
            productId: selectedProduct.productId,
            type: "saida",
            quantity,
            referenceDate: saleDate,
            createdAt: FieldValue.serverTimestamp(),
            saleId: saleRef.id,
            source: "promokit",
            recognitionSource: "ai_kit_substitution",
            promokitOrderCode: code,
            promokitItemId: lineItem.promokitItemId || null,
            promokitProductId: lineItem.promokitProductId || null,
            promokitSelectedName: selectedProduct.name,
            promokitDetails: lineItem.detailsText || null,
            aiReason: aiInterpretation.reason,
          });
          movementCount += 1;
          totalQuantity += quantity;
        }
      } else if (isCustomKitLineItem(lineItem)) {
        needsReview = true;
        await logOperationalEvent(db, {
          type: "promokit_kit_missing_choices",
          title: `Pedido #${code} precisa revisar kit personalizado`,
          status: "warning",
          source: "promokit",
          entityId: code,
          message: `${lineItem.name} chegou sem marmitas escolhidas claras. A venda foi registrada sem baixa automatica deste kit para evitar estoque errado.`,
          metadata: {
            itemName: lineItem.name,
            quantity: lineItem.quantity,
            detailsText: lineItem.detailsText || null,
            aiReason: aiInterpretation.reason,
          },
        });
      } else {
        for (const kitItem of kitItems) {
          const quantity = Number(kitItem.quantity || 0) * lineItem.quantity;
          if (!kitItem.productId || quantity <= 0) continue;

          const movementRef = db.collection("movements").doc();
          batch.set(movementRef, {
            productId: kitItem.productId,
            type: "saida",
            quantity,
            referenceDate: saleDate,
            createdAt: FieldValue.serverTimestamp(),
            saleId: saleRef.id,
            source: "promokit",
            recognitionSource: "local_kit_composition",
            promokitOrderCode: code,
            promokitItemId: lineItem.promokitItemId || null,
            promokitProductId: lineItem.promokitProductId || null,
            promokitDetails: lineItem.detailsText || null,
          });
          movementCount += 1;
          totalQuantity += quantity;
        }

        if (lineItem.detailsText) {
          needsReview = true;
          await logOperationalEvent(db, {
            type: "promokit_kit_fallback_composition",
            title: `Pedido #${code} baixado pela composicao local`,
            status: "warning",
            source: "promokit",
            entityId: code,
            message: `${lineItem.name} tinha detalhes, mas nao havia escolha/troca clara. O estoque foi baixado pela composicao cadastrada do kit.`,
            metadata: {
              itemName: lineItem.name,
              quantity: lineItem.quantity,
              detailsText: lineItem.detailsText,
              aiReason: aiInterpretation.reason,
            },
          });
        }
      }
      continue;
    }

    if (isCustomKitLineItem(lineItem)) {
      const explicitProducts = findProductsExplicitlyListedInDetails(lineItem, productsSnapshot);
      const aiInterpretation =
        explicitProducts.length > 0
          ? {
              selectedProducts: [],
              substitutions: [],
              confidence: 0,
              reason: "Promokit enviou as marmitas na descricao do item.",
            }
          : await interpretKitDetailsWithAi({ lineItem, kitItems: [], productsSnapshot });
      const aiSelectedProducts =
        explicitProducts.length > 0 ? [] : resolveAiSelectedProducts(aiInterpretation, lineItem, productsSnapshot);
      const selectedSourceProducts = explicitProducts.length > 0 ? explicitProducts : aiSelectedProducts;
      const selectedRecognitionSource = explicitProducts.length > 0 ? "promokit_item_description" : "ai_kit_observation";

      if (selectedSourceProducts.length > 0) {
        for (const selectedProduct of selectedSourceProducts) {
          const quantity = selectedProduct.quantity * lineItem.quantity;
          if (!selectedProduct.productId || quantity <= 0) continue;

          const movementRef = db.collection("movements").doc();
          batch.set(movementRef, {
            productId: selectedProduct.productId,
            type: "saida",
            quantity,
            referenceDate: saleDate,
            createdAt: FieldValue.serverTimestamp(),
            saleId: saleRef.id,
            source: "promokit",
            recognitionSource: selectedRecognitionSource,
            promokitOrderCode: code,
            promokitItemId: lineItem.promokitItemId || null,
            promokitProductId: lineItem.promokitProductId || null,
            promokitSelectedName: selectedProduct.name,
            promokitDetails: lineItem.detailsText || null,
            aiReason: explicitProducts.length > 0 ? "Promokit enviou as marmitas na descricao do item." : aiInterpretation.reason,
          });
          movementCount += 1;
          totalQuantity += quantity;
        }
      } else {
        needsReview = true;
        await logOperationalEvent(db, {
          type: "promokit_custom_kit_without_local_match",
          title: `Pedido #${code} com Monte seu Kit sem marmitas claras`,
          status: "warning",
          source: "promokit",
          entityId: code,
          message: `${lineItem.name} nao casou com um kit local e nao trouxe marmitas claras. A venda foi registrada sem criar produto falso no estoque.`,
          metadata: {
            itemName: lineItem.name,
            quantity: lineItem.quantity,
            detailsText: lineItem.detailsText || null,
            aiReason: aiInterpretation.reason,
          },
        });
      }
      syncedProductCount += 1;
      continue;
    }

    const productId = await upsertPromokitProduct(lineItem);
    syncedProductCount += 1;

    const movementRef = db.collection("movements").doc();
    batch.set(movementRef, {
      productId,
      type: "saida",
      quantity: lineItem.quantity,
      referenceDate: saleDate,
      createdAt: FieldValue.serverTimestamp(),
      saleId: saleRef.id,
      source: "promokit",
      promokitOrderCode: code,
      promokitItemId: lineItem.promokitItemId || null,
      promokitProductId: lineItem.promokitProductId || null,
    });
    movementCount += 1;
    totalQuantity += lineItem.quantity;
  }

  batch.set(saleRef, {
    customerName: getCustomerName(order),
    value: Number(order?.total ?? 0),
    totalQuantity,
    itemsDescription: lineItems.map((item) => `${item.quantity}x ${item.name}`).join(", "),
    orderNumber: code,
    saleDate,
    createdAt: FieldValue.serverTimestamp(),
    source: "promokit",
    promokitOrderCode: code,
    promokitStatus: order?.status || "",
    promokitPaid: Boolean(order?.pago),
    promokitCustomerId: order?.cliente?.id ? String(order.cliente.id) : null,
  });

  batch.set(
    db.collection("promokit_orders").doc(code),
    {
      processedSaleId: saleRef.id,
      processingStatus: needsReview ? "sale_created_needs_review" : "sale_created",
      processedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    code,
    saleId: saleRef.id,
    createdSale: true,
    movementCount,
    syncedProductCount,
  };
}
