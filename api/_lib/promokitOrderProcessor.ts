import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";

type PromokitLineItem = {
  name: string;
  quantity: number;
  price: number;
  total: number;
  promokitItemId: string;
  promokitProductId: string;
  pdvCode: string;
  raw: any;
};

type PromokitSelectedProduct = {
  name: string;
  quantity: number;
  raw: any;
};

type ProcessOrderResult = {
  code: string;
  saleId: string | null;
  createdSale: boolean;
  movementCount: number;
  syncedProductCount: number;
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

      return {
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        price: Number.isFinite(price) ? price : 0,
        total: Number.isFinite(total) ? total : 0,
        promokitItemId: String(item?.id || ""),
        promokitProductId: String(product?.id || item?.produtoId || ""),
        pdvCode: extractPdvCode(product),
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
      (value?.produto || value?.item || value?.produtoId || value?.idProduto || value?.codigoPdv || value?.codigoPDV)
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

async function findProductsSelectedInsideKit(lineItem: PromokitLineItem) {
  const db = getAdminDb();
  const productsSnapshot = await db.collection("products").get();
  const selectedProducts = collectNestedSelectedProducts(lineItem.raw, lineItem.name);
  const matched: { productId: string; quantity: number; name: string }[] = [];

  selectedProducts.forEach((selected) => {
    const selectedName = normalizeText(selected.name);
    if (!selectedName) return;
    const productDoc = productsSnapshot.docs.find((doc) => {
      const productName = normalizeText(String(doc.data().name || ""));
      return productName === selectedName || productName.includes(selectedName) || selectedName.includes(productName);
    });
    if (!productDoc) return;
    matched.push({
      productId: productDoc.ref.id,
      quantity: selected.quantity,
      name: selected.name,
    });
  });

  return matched;
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

export async function processPromokitOrder(order: any): Promise<ProcessOrderResult | null> {
  const db = getAdminDb();
  const code = getOrderCode(order);
  if (!code) return null;

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

  for (const lineItem of lineItems) {
    const kitDoc = await findKit(lineItem);

    if (kitDoc) {
      const kitData = kitDoc.data();
      const kitItems = Array.isArray(kitData.items) ? kitData.items : [];
      const promokitCatalogId = lineItem.promokitProductId || lineItem.pdvCode || normalizeText(lineItem.name);
      const selectedProducts = await findProductsSelectedInsideKit(lineItem);

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

      if (selectedProducts.length > 0) {
        for (const selectedProduct of selectedProducts) {
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
            recognitionSource: "promokit_kit_selection",
            promokitOrderCode: code,
            promokitItemId: lineItem.promokitItemId || null,
            promokitProductId: lineItem.promokitProductId || null,
            promokitSelectedName: selectedProduct.name,
          });
          movementCount += 1;
          totalQuantity += quantity;
        }
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
          });
          movementCount += 1;
          totalQuantity += quantity;
        }
      }
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
      processingStatus: "sale_created",
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
