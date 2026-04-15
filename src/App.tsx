import { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  Product, 
  Movement, 
  StockItem, 
  Kit,
  Supplier,
  ShoppingProduct,
  Bill,
  Sale,
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  deleteDoc,
  updateDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { interpretStockText, AIInterpretation } from './gemini';
import { 
  Plus, 
  Minus, 
  Package, 
  History, 
  Brain, 
  LogOut, 
  LogIn, 
  Check, 
  Loader2,
  AlertCircle,
  Settings,
  Trash2,
  ChevronRight,
  LayoutDashboard,
  Calendar,
  ShoppingCart,
  Store,
  UserPlus,
  FileText,
  Copy,
  CreditCard,
  Wallet,
  Clock,
  AlertTriangle,
  Repeat,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  subDays,
  startOfDay,
  endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Error Boundary Component
function ErrorDisplay({ error, onRetry }: { error: string, onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
      <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-red-100">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle size={24} />
          <h2 className="text-lg font-semibold">Erro no Sistema</h2>
        </div>
        <p className="text-gray-600 mb-6 text-sm break-words">{error}</p>
        <button 
          onClick={onRetry}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'estoque' | 'producao' | 'vendas' | 'historico' | 'config' | 'compras' | 'contas'>('dashboard');
  const [configSubTab, setConfigSubTab] = useState<'produtos' | 'kits' | 'lista'>('produtos');
  const [vendasSubTab, setVendasSubTab] = useState<'lancar' | 'registros'>('lancar');
  const [shoppingSubTab, setShoppingSubTab] = useState<'produtos' | 'fornecedores' | 'lista'>('lista');
  const [billsSubTab, setBillsSubTab] = useState<'lista' | 'pagas' | 'cadastrar'>('lista');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<AIInterpretation | null>(null);

  // Deletion Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'product' | 'kit' | 'supplier' | 'shoppingProduct' | 'bill', name: string } | null>(null);

  // Shopping List State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [shoppingProducts, setShoppingProducts] = useState<ShoppingProduct[]>([]);
  const [newSupplier, setNewSupplier] = useState({ name: '', location: '', contact: '' });
  const [newShoppingProduct, setNewShoppingProduct] = useState({ name: '', supplierId: '', unit: '' });
  const [shoppingListItems, setShoppingListItems] = useState<Record<string, number>>({});
  const [generatedList, setGeneratedList] = useState<string | null>(null);

  // Bills State
  const [bills, setBills] = useState<Bill[]>([]);
  const [newBill, setNewBill] = useState({ name: '', value: '', paymentCode: '', dueDate: '', isRecurring: false });

  // Sales State
  const [sales, setSales] = useState<Sale[]>([]);
  const [newSale, setNewSale] = useState({ customerName: '', value: '', saleDate: format(new Date(), 'yyyy-MM-dd') });

  // Dashboard State
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Kit Creation State
  const [newKitName, setNewKitName] = useState('');
  const [newKitPrice, setNewKitPrice] = useState('');
  const [kitItems, setKitItems] = useState<{ productId: string, quantity: number }[]>([]);

  // Product Creation State
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email !== 'ateliefitlondrina@gmail.com') {
        logout();
        setError("Acesso restrito. Apenas o administrador pode acessar este sistema.");
        setUser(null);
      } else {
        setUser(user);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const productsQuery = query(collection(db, 'products'), orderBy('name'));
    const movementsQuery = query(collection(db, 'movements'), orderBy('createdAt', 'desc'));
    const kitsQuery = query(collection(db, 'kits'), orderBy('name'));

    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubMovements = onSnapshot(movementsQuery, (snapshot) => {
      const movs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
      setMovements(movs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'movements'));

    const unsubKits = onSnapshot(kitsQuery, (snapshot) => {
      const kts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit));
      setKits(kts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'kits'));

    const unsubSuppliers = onSnapshot(query(collection(db, 'suppliers'), orderBy('name')), (snapshot) => {
      const sups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(sups);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'));

    const unsubShoppingProducts = onSnapshot(query(collection(db, 'shoppingProducts'), orderBy('name')), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingProduct));
      setShoppingProducts(prods);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'shoppingProducts'));

    const unsubBills = onSnapshot(query(collection(db, 'bills'), orderBy('dueDate', 'asc')), (snapshot) => {
      const blls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill));
      setBills(blls);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bills'));

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('saleDate', 'desc')), (snapshot) => {
      const sls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      setSales(sls);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

    return () => {
      unsubProducts();
      unsubMovements();
      unsubKits();
      unsubSuppliers();
      unsubShoppingProducts();
      unsubBills();
      unsubSales();
    };
  }, [user]);

  // Calculate Stock
  useEffect(() => {
    const stockMap = new Map<string, number>();
    
    movements.forEach(m => {
      const current = stockMap.get(m.productId) || 0;
      if (m.type === 'entrada') {
        stockMap.set(m.productId, current + m.quantity);
      } else {
        stockMap.set(m.productId, current - m.quantity);
      }
    });

    const stockItems = products.map(p => ({
      ...p,
      currentStock: stockMap.get(p.id) || 0
    }));

    setStock(stockItems);
  }, [products, movements]);

  const handleProcessIA = async (type: 'entrada' | 'saida') => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const context = {
        products: products.map(p => p.name),
        kits: kits.map(k => k.name)
      };
      const result = await interpretStockText(inputText, type, context);
      setPreview(result);
    } catch (err) {
      setError("Falha ao interpretar texto. Tente novamente.");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmMovements = async () => {
    if (!preview) return;
    setIsProcessing(true);
    setError(null);

    try {
      const saleDateTimestamp = preview.tipo === 'saida' && newSale.customerName 
        ? Timestamp.fromDate(new Date(newSale.saleDate + 'T12:00:00'))
        : Timestamp.now();

      for (const item of preview.itens) {
        if (item.isKit) {
          // Robust matching for kits
          let kit = kits.find(k => k.name.toLowerCase().trim() === item.produto.toLowerCase().trim());
          
          if (!kit) {
            // Try fuzzy match if exact fails
            kit = kits.find(k => k.name.toLowerCase().includes(item.produto.toLowerCase()) || 
                                item.produto.toLowerCase().includes(k.name.toLowerCase()));
          }
          
          if (!kit) {
            throw new Error(`Kit "${item.produto}" não encontrado no cardápio. Por favor, verifique o nome.`);
          }

          for (const kitItem of kit.items) {
            const originalProduct = products.find(p => p.id === kitItem.productId);
            let finalProductId = kitItem.productId;
            let finalProductName = originalProduct?.name || 'Produto';

            // Handle substitutions
            if (item.substituicoes && item.substituicoes.length > 0) {
              const sub = item.substituicoes.find(s => 
                originalProduct?.name.toLowerCase().includes(s.remover.toLowerCase()) ||
                s.remover.toLowerCase().includes(originalProduct?.name.toLowerCase() || '')
              );

              if (sub) {
                const newProduct = products.find(p => 
                  p.name.toLowerCase().trim() === sub.adicionar.toLowerCase().trim() ||
                  p.name.toLowerCase().includes(sub.adicionar.toLowerCase())
                );
                if (newProduct) {
                  finalProductId = newProduct.id;
                  finalProductName = newProduct.name;
                }
              }
            }

            const totalQty = kitItem.quantity * item.quantidade;
            
            // Check stock for kit components (original or substituted) if exit
            if (preview.tipo === 'saida') {
              const currentStock = stock.find(s => s.id === finalProductId)?.currentStock || 0;
              if (currentStock < totalQty) {
                throw new Error(`Estoque insuficiente de "${finalProductName}" para o kit "${kit.name}". Atual: ${currentStock}, Necessário: ${totalQty}`);
              }
            }

            await addDoc(collection(db, 'movements'), {
              productId: finalProductId,
              type: preview.tipo,
              quantity: totalQty,
              referenceDate: saleDateTimestamp,
              createdAt: serverTimestamp()
            });
          }
        } else {
          // Normal product logic with robust matching
          let product = products.find(p => p.name.toLowerCase().trim() === item.produto.toLowerCase().trim());
          
          if (!product) {
            // Try fuzzy match if exact fails
            product = products.find(p => p.name.toLowerCase().includes(item.produto.toLowerCase()) || 
                                      item.produto.toLowerCase().includes(p.name.toLowerCase()));
          }

          let productId = product?.id;

          if (!productId) {
            throw new Error(`Produto "${item.produto}" não encontrado no cardápio. Por favor, cadastre-o primeiro na aba Cardápio/Kits.`);
          }

          if (preview.tipo === 'saida') {
            const currentStock = stock.find(s => s.id === productId)?.currentStock || 0;
            if (currentStock < item.quantidade) {
              throw new Error(`Estoque insuficiente para "${item.produto}". Atual: ${currentStock}, Necessário: ${item.quantidade}`);
            }
          }

          await addDoc(collection(db, 'movements'), {
            productId,
            type: preview.tipo,
            quantity: item.quantidade,
            referenceDate: saleDateTimestamp,
            createdAt: serverTimestamp()
          });
        }
      }

      // Record Sale if it's a sale (saida) and we have customer info
      if (preview.tipo === 'saida' && newSale.customerName) {
        await addDoc(collection(db, 'sales'), {
          customerName: newSale.customerName,
          value: parseFloat(newSale.value) || 0,
          itemsDescription: preview.itens.map(i => `${i.quantidade}x ${i.produto}`).join(', '),
          saleDate: saleDateTimestamp,
          createdAt: serverTimestamp()
        });
        setNewSale({ customerName: '', value: '', saleDate: format(new Date(), 'yyyy-MM-dd') });
      }

      setPreview(null);
      setInputText('');
      setActiveTab('vendas');
      setVendasSubTab('registros');
    } catch (err: any) {
      setError(err.message || "Erro ao salvar movimentações.");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveKit = async () => {
    if (!newKitName || kitItems.length === 0) return;
    try {
      await addDoc(collection(db, 'kits'), {
        name: newKitName.toLowerCase(),
        price: newKitPrice ? parseFloat(newKitPrice) : 0,
        items: kitItems,
        createdAt: serverTimestamp()
      });
      setNewKitName('');
      setNewKitPrice('');
      setKitItems([]);
    } catch (err) {
      setError("Erro ao salvar kit.");
    }
  };

  const saveProduct = async () => {
    if (!newProductName.trim()) return;
    try {
      await addDoc(collection(db, 'products'), {
        name: newProductName.toLowerCase().trim(),
        price: newProductPrice ? parseFloat(newProductPrice) : 0,
        createdAt: serverTimestamp()
      });
      setNewProductName('');
      setNewProductPrice('');
    } catch (err) {
      setError("Erro ao salvar produto.");
    }
  };

  const deleteProduct = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    // Check if product is in any kit
    const isInKit = kits.some(k => k.items.some(i => i.productId === id));
    if (isInKit) {
      setError("Não é possível excluir um produto que faz parte de um kit.");
      return;
    }
    
    setDeleteConfirm({ id, type: 'product', name: product.name });
  };

  const deleteKit = async (id: string) => {
    const kit = kits.find(k => k.id === id);
    if (!kit) return;
    setDeleteConfirm({ id, type: 'kit', name: kit.name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'product') {
        await deleteDoc(doc(db, 'products', deleteConfirm.id));
      } else if (deleteConfirm.type === 'kit') {
        await deleteDoc(doc(db, 'kits', deleteConfirm.id));
      } else if (deleteConfirm.type === 'supplier') {
        await deleteDoc(doc(db, 'suppliers', deleteConfirm.id));
      } else if (deleteConfirm.type === 'shoppingProduct') {
        await deleteDoc(doc(db, 'shoppingProducts', deleteConfirm.id));
      } else if (deleteConfirm.type === 'bill') {
        await deleteDoc(doc(db, 'bills', deleteConfirm.id));
      }
      setDeleteConfirm(null);
    } catch (err) {
      setError(`Erro ao excluir ${deleteConfirm.type}.`);
    }
  };

  const saveSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    try {
      await addDoc(collection(db, 'suppliers'), {
        ...newSupplier,
        createdAt: serverTimestamp()
      });
      setNewSupplier({ name: '', location: '', contact: '' });
    } catch (err) {
      setError("Erro ao salvar fornecedor.");
    }
  };

  const saveShoppingProduct = async () => {
    if (!newShoppingProduct.name.trim() || !newShoppingProduct.supplierId || !newShoppingProduct.unit) return;
    try {
      await addDoc(collection(db, 'shoppingProducts'), {
        ...newShoppingProduct,
        createdAt: serverTimestamp()
      });
      setNewShoppingProduct({ name: '', supplierId: '', unit: '' });
    } catch (err) {
      setError("Erro ao salvar produto de compra.");
    }
  };

  const finalizeShoppingList = () => {
    const selectedItems = Object.entries(shoppingListItems).filter(([_, qty]) => (qty as number) > 0);
    if (selectedItems.length === 0) return;

    const groupedBySupplier: Record<string, string[]> = {};

    selectedItems.forEach(([id, qty]) => {
      const product = shoppingProducts.find(p => p.id === id);
      if (product) {
        const supplier = suppliers.find(s => s.id === product.supplierId);
        const supplierName = supplier?.name || 'Fornecedor Desconhecido';
        if (!groupedBySupplier[supplierName]) {
          groupedBySupplier[supplierName] = [];
        }
        groupedBySupplier[supplierName].push(`- ${product.name} / ${qty} ${product.unit}`);
      }
    });

    const today = format(new Date(), 'dd/MM/yyyy');
    let message = `📋 *LISTA DE COMPRAS - ATELIÊ FIT* (${today})\n\n`;
    Object.entries(groupedBySupplier).forEach(([supplier, items]) => {
      message += `*${supplier}*\n${items.join('\n')}\n\n`;
    });

    setGeneratedList(message);
  };

  const saveBill = async () => {
    if (!newBill.name.trim() || !newBill.value || !newBill.dueDate) return;
    try {
      await addDoc(collection(db, 'bills'), {
        name: newBill.name,
        value: Number(newBill.value),
        paymentCode: newBill.paymentCode,
        dueDate: Timestamp.fromDate(new Date(newBill.dueDate + 'T00:00:00')),
        isPaid: false,
        isRecurring: newBill.isRecurring,
        createdAt: serverTimestamp()
      });
      setNewBill({ name: '', value: '', paymentCode: '', dueDate: '', isRecurring: false });
      setBillsSubTab('lista');
    } catch (err) {
      setError("Erro ao salvar conta.");
    }
  };

  const toggleBillStatus = async (bill: Bill) => {
    try {
      await updateDoc(doc(db, 'bills', bill.id), {
        isPaid: !bill.isPaid
      });
    } catch (err) {
      setError("Erro ao atualizar status da conta.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="text-emerald-600" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ateliê Fit</h1>
          <p className="text-gray-500 mb-8">Gestão de Estoque Inteligente</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <LogIn size={20} />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => setError(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="bg-white w-full md:w-64 md:min-h-screen border-b md:border-b-0 md:border-r border-gray-100 flex flex-col sticky top-0 z-20">
        <div className="px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Package className="text-emerald-600" size={24} />
            </div>
            <h1 className="font-bold text-gray-900 text-xl">Ateliê Fit</h1>
          </div>
          <button onClick={logout} className="md:hidden p-2 text-gray-400 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-2 overflow-x-auto md:overflow-x-visible flex md:flex-col no-scrollbar">
          {(['dashboard', 'estoque', 'producao', 'vendas', 'config', 'compras', 'contas'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setPreview(null);
                setInputText('');
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all capitalize whitespace-nowrap md:whitespace-normal w-full ${
                activeTab === tab 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab === 'dashboard' && <LayoutDashboard size={18} />}
              {tab === 'estoque' && <Package size={18} />}
              {tab === 'producao' && <Plus size={18} />}
              {tab === 'vendas' && <Minus size={18} />}
              {tab === 'config' && <Settings size={18} />}
              {tab === 'compras' && <ShoppingCart size={18} />}
              {tab === 'contas' && <CreditCard size={18} />}
              {tab === 'config' ? 'Cardápio' : 
               tab === 'compras' ? 'Lista de Compras' : 
               tab === 'contas' ? 'Contas a Pagar' : 
               tab === 'producao' ? 'Produção' :
               tab === 'vendas' ? 'Vendas' :
               tab}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex p-4 border-t border-gray-50 items-center justify-around">
          <button 
            onClick={() => {
              setActiveTab('historico');
              setPreview(null);
              setInputText('');
            }}
            className={`p-3 rounded-xl transition-all ${
              activeTab === 'historico' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            title="Histórico"
          >
            <History size={20} />
          </button>
          <button 
            onClick={logout} 
            className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Sair da Conta"
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                  <Calendar size={18} className="text-gray-400 ml-2" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent border-none text-sm focus:ring-0 text-gray-600"
                  />
                  <span className="text-gray-300">|</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-none text-sm focus:ring-0 text-gray-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6">
                  <div className="p-4 bg-emerald-100 rounded-2xl">
                    <Package className="text-emerald-600" size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-400 uppercase mb-1">Total em Estoque</p>
                    <p className="text-3xl font-black text-gray-900">
                      {stock.reduce((acc, item) => acc + item.currentStock, 0)}
                      <span className="text-sm font-normal text-gray-400 ml-2">unidades</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6">
                  <div className="p-4 bg-blue-100 rounded-2xl">
                    <Minus className="text-blue-600" size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-400 uppercase mb-1">Vendas do Mês</p>
                    <p className="text-3xl font-black text-emerald-600">
                      R$ {movements
                        .filter(m => {
                          const date = (m.referenceDate || m.createdAt)?.toDate();
                          if (m.type !== 'saida' || !date) return false;
                          const now = new Date();
                          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                        })
                        .reduce((acc, m) => {
                          const product = products.find(p => p.id === m.productId);
                          return acc + (m.quantity * (product?.price || 0));
                        }, 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Volume de Vendas por Dia</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={eachDayOfInterval({
                        start: startOfDay(new Date(startDate + 'T00:00:00')),
                        end: endOfDay(new Date(endDate + 'T23:59:59'))
                      }).map(day => {
                        const daySales = movements
                          .filter(m => m.type === 'saida' && (m.referenceDate || m.createdAt) && isSameDay((m.referenceDate || m.createdAt).toDate(), day))
                          .reduce((acc, m) => acc + m.quantity, 0);
                        return {
                          name: format(day, 'dd/MM', { locale: ptBR }),
                          vendas: daySales
                        };
                      })}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                          padding: '12px'
                        }}
                      />
                      <Bar 
                        dataKey="vendas" 
                        fill="#10b981" 
                        radius={[6, 6, 0, 0]} 
                        barSize={30}
                      >
                        {/* Custom colors for bars if needed */}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'estoque' && (
            <motion.div 
              key="estoque"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Valor Total em Estoque</p>
                  <p className="text-2xl font-black text-emerald-600">
                    R$ {stock.reduce((acc, item) => acc + (item.currentStock * (item.price || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Total de Marmitas</p>
                  <p className="text-2xl font-black text-gray-900">
                    {stock.reduce((acc, item) => acc + item.currentStock, 0)} <span className="text-sm font-normal text-gray-400">unidades</span>
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Marmitas em Estoque</h2>
                {stock.length === 0 ? (
                  <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                    <Package className="mx-auto text-gray-300 mb-4" size={48} />
                    <p className="text-gray-500">Nenhum produto cadastrado.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stock.map(item => (
                      <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm flex items-center justify-between border border-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-emerald-50 rounded-lg">
                            <Package className="text-emerald-600" size={20} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 capitalize">{item.name}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-600">
                                R$ {item.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                Total: R$ {(item.currentStock * (item.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={`text-xl font-bold ${item.currentStock > 5 ? 'text-emerald-600' : 'text-orange-500'}`}>
                          {item.currentStock} <span className="text-sm font-normal text-gray-400">un</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Kits Disponíveis (Montáveis)</h2>
                {kits.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Nenhum kit cadastrado.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {kits.map(kit => {
                      // Calculate how many kits can be made
                      const possibleKits = kit.items.reduce((min, item) => {
                        const productStock = stock.find(s => s.id === item.productId)?.currentStock || 0;
                        const canMake = Math.floor(productStock / item.quantity);
                        return Math.min(min, canMake);
                      }, Infinity);

                      const displayKits = possibleKits === Infinity ? 0 : possibleKits;

                      return (
                        <div key={kit.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-gray-900 capitalize">{kit.name}</h3>
                              <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">
                                R$ {kit.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="space-y-1 mb-4">
                              {kit.items.slice(0, 3).map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                return (
                                  <p key={idx} className="text-[10px] text-gray-400 truncate">
                                    • {item.quantity}x {prod?.name}
                                  </p>
                                );
                              })}
                              {kit.items.length > 3 && <p className="text-[10px] text-gray-400">...</p>}
                            </div>
                          </div>
                          <div className="pt-4 border-t border-gray-50 flex items-end justify-between">
                            <span className="text-xs text-gray-400">Disponível:</span>
                            <span className={`text-2xl font-black ${displayKits > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                              {displayKits} <span className="text-xs font-normal">kits</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'producao' && (
            <motion.div 
              key="producao"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <Plus size={20} />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Registrar Produção</h2>
                </div>
                
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ex: Fiz 10 parmegiana e 5 escondidinho..."
                  className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all resize-none text-gray-700"
                />

                <button
                  disabled={isProcessing || !inputText.trim()}
                  onClick={() => handleProcessIA('entrada')}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-black transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Brain size={20} />}
                  Processar com IA
                </button>
              </div>

              {preview && preview.tipo === 'entrada' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-200"
                >
                  <h3 className="font-bold text-emerald-900 mb-4 flex items-center gap-2">
                    <Check size={20} /> Confirmar Lançamento
                  </h3>
                  <div className="space-y-3 mb-6">
                    {preview.itens.map((item, idx) => {
                      const kit = item.isKit ? kits.find(k => 
                        k.name.toLowerCase().trim() === item.produto.toLowerCase().trim() ||
                        k.name.toLowerCase().includes(item.produto.toLowerCase()) ||
                        item.produto.toLowerCase().includes(k.name.toLowerCase())
                      ) : null;
                      
                      return (
                        <div key={idx} className="bg-white/50 p-4 rounded-2xl border border-emerald-100">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              <span className="capitalize text-emerald-800 font-bold">{item.produto}</span>
                              {item.isKit && <span className="text-[10px] bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">Kit</span>}
                            </div>
                            <span className="font-bold text-emerald-900">{item.quantidade} un</span>
                          </div>

                          {item.isKit && kit && (
                            <div className="mt-2 pl-4 border-l-2 border-emerald-200 space-y-1">
                              {kit.items.map((kitItem, kIdx) => {
                                const originalProd = products.find(p => p.id === kitItem.productId);
                                const sub = item.substituicoes?.find(s => 
                                  originalProd?.name.toLowerCase().includes(s.remover.toLowerCase()) ||
                                  s.remover.toLowerCase().includes(originalProd?.name.toLowerCase() || '')
                                );
                                
                                return (
                                  <div key={kIdx} className="text-xs flex items-center gap-2">
                                    <ChevronRight size={12} className="text-emerald-400" />
                                    {sub ? (
                                      <div className="flex items-center gap-1">
                                        <span className="line-through text-gray-400">{originalProd?.name}</span>
                                        <span className="text-emerald-600 font-bold">→ {sub.adicionar}</span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">{originalProd?.name}</span>
                                    )}
                                    <span className="text-gray-400 font-medium">({kitItem.quantity * item.quantidade} un)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setPreview(null)}
                      className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmMovements}
                      className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                    >
                      Confirmar
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'vendas' && (
            <motion.div 
              key="vendas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto">
                {(['lancar', 'registros'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setVendasSubTab(sub)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      vendasSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'lancar' ? 'Lançar Venda' : 'Registros de Vendas'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {vendasSubTab === 'lancar' && (
                  <motion.div 
                    key="lancar-venda"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-red-100 text-red-600">
                          <Minus size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">Lançar Novo Pedido</h2>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Cliente</label>
                          <input 
                            type="text"
                            value={newSale.customerName}
                            onChange={(e) => setNewSale({...newSale, customerName: e.target.value})}
                            placeholder="Nome do Cliente"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Valor Recebido</label>
                          <input 
                            type="number"
                            value={newSale.value}
                            onChange={(e) => setNewSale({...newSale, value: e.target.value})}
                            placeholder="R$ 0,00"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Data</label>
                          <input 
                            type="date"
                            value={newSale.saleDate}
                            onChange={(e) => setNewSale({...newSale, saleDate: e.target.value})}
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Produtos (IA)</label>
                        <textarea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Ex: Saiu 2 parmegiana e 1 escondidinho..."
                          className="w-full h-32 p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all resize-none text-gray-700"
                        />
                      </div>

                      <button
                        disabled={isProcessing || !inputText.trim() || !newSale.customerName.trim()}
                        onClick={() => handleProcessIA('saida')}
                        className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-black transition-all disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Brain size={20} />}
                        Processar e Lançar
                      </button>
                    </div>

                    {preview && preview.tipo === 'saida' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-200"
                      >
                        <h3 className="font-bold text-emerald-900 mb-4 flex items-center gap-2">
                          <Check size={20} /> Confirmar Pedido de {newSale.customerName}
                        </h3>
                        <div className="space-y-3 mb-6">
                          {preview.itens.map((item, idx) => {
                            const kit = item.isKit ? kits.find(k => 
                              k.name.toLowerCase().trim() === item.produto.toLowerCase().trim() ||
                              k.name.toLowerCase().includes(item.produto.toLowerCase()) ||
                              item.produto.toLowerCase().includes(k.name.toLowerCase())
                            ) : null;
                            
                            return (
                              <div key={idx} className="bg-white/50 p-4 rounded-2xl border border-emerald-100">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="capitalize text-emerald-800 font-bold">{item.produto}</span>
                                    {item.isKit && <span className="text-[10px] bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase">Kit</span>}
                                  </div>
                                  <span className="font-bold text-emerald-900">{item.quantidade} un</span>
                                </div>

                                {item.isKit && kit && (
                                  <div className="mt-2 pl-4 border-l-2 border-emerald-200 space-y-1">
                                    {kit.items.map((kitItem, kIdx) => {
                                      const originalProd = products.find(p => p.id === kitItem.productId);
                                      const sub = item.substituicoes?.find(s => 
                                        originalProd?.name.toLowerCase().includes(s.remover.toLowerCase()) ||
                                        s.remover.toLowerCase().includes(originalProd?.name.toLowerCase() || '')
                                      );
                                      
                                      return (
                                        <div key={kIdx} className="text-xs flex items-center gap-2">
                                          <ChevronRight size={12} className="text-emerald-400" />
                                          {sub ? (
                                            <div className="flex items-center gap-1">
                                              <span className="line-through text-gray-400">{originalProd?.name}</span>
                                              <span className="text-emerald-600 font-bold">→ {sub.adicionar}</span>
                                            </div>
                                          ) : (
                                            <span className="text-gray-600">{originalProd?.name}</span>
                                          )}
                                          <span className="text-gray-400 font-medium">({kitItem.quantity * item.quantidade} un)</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setPreview(null)}
                            className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button 
                            onClick={confirmMovements}
                            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                          >
                            Confirmar Venda
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {vendasSubTab === 'registros' && (
                  <motion.div 
                    key="registros-vendas"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Vendas Realizadas</h2>
                    {sales.length === 0 ? (
                      <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                        <DollarSign className="mx-auto text-gray-300 mb-4" size={48} />
                        <p className="text-gray-500">Nenhuma venda registrada.</p>
                      </div>
                    ) : (
                      sales.map(sale => (
                        <div key={sale.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                              <UserPlus size={24} />
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">{sale.customerName}</h3>
                              <p className="text-xs text-gray-400 flex items-center gap-1">
                                <Calendar size={12} /> {sale.saleDate?.toDate().toLocaleDateString('pt-BR')}
                              </p>
                              <p className="text-sm text-gray-600 mt-1 italic">"{sale.itemsDescription}"</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-400 uppercase">Valor</p>
                            <p className="text-xl font-black text-emerald-600">
                              R$ {sale.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <button 
                              onClick={async () => {
                                if (confirm('Deseja excluir este registro de venda? (Isso não retornará os produtos ao estoque automaticamente)')) {
                                  await deleteDoc(doc(db, 'sales', sale.id));
                                }
                              }}
                              className="text-red-400 hover:text-red-600 mt-2 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'historico' && (
            <motion.div 
              key="historico"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Histórico Recente</h2>
              {movements.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                  <History className="mx-auto text-gray-300 mb-4" size={48} />
                  <p className="text-gray-500">Nenhuma movimentação registrada.</p>
                </div>
              ) : (
                movements.map(m => {
                  const product = products.find(p => p.id === m.productId);
                  return (
                    <div key={m.id} className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 border border-gray-100">
                      <div className={`p-2 rounded-lg ${m.type === 'entrada' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                        {m.type === 'entrada' ? <Plus size={18} /> : <Minus size={18} />}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 capitalize">{product?.name || 'Produto Removido'}</h3>
                        <p className="text-xs text-gray-400">
                          {(m.referenceDate || m.createdAt)?.toDate().toLocaleString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </div>
                      <div className={`font-bold ${m.type === 'entrada' ? 'text-blue-600' : 'text-red-600'}`}>
                        {m.type === 'entrada' ? '+' : '-'}{m.quantity}
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Sub-tabs for Config */}
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto">
                {(['produtos', 'kits', 'lista'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setConfigSubTab(sub)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      configSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'produtos' && 'Adicionar Produtos'}
                    {sub === 'kits' && 'Criar Kits'}
                    {sub === 'lista' && 'Produtos Cadastrados'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {configSubTab === 'produtos' && (
                  <motion.section 
                    key="add-products"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Package className="text-emerald-600" size={24} /> Cadastrar Marmita/Salgado
                    </h2>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input 
                        type="text"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="Nome da Marmita"
                        className="flex-1 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        type="number"
                        value={newProductPrice}
                        onChange={(e) => setNewProductPrice(e.target.value)}
                        placeholder="Valor R$"
                        className="w-full sm:w-32 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button 
                        onClick={saveProduct}
                        disabled={!newProductName.trim()}
                        className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        Adicionar
                      </button>
                    </div>
                  </motion.section>
                )}

                {configSubTab === 'kits' && (
                  <motion.section 
                    key="create-kits"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
                  >
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Plus className="text-emerald-600" size={24} /> Criar Novo Kit
                    </h2>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Nome do Kit</label>
                          <input 
                            type="text"
                            value={newKitName}
                            onChange={(e) => setNewKitName(e.target.value)}
                            placeholder="Ex: Kit Maromba 10 un"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Valor de Venda (R$)</label>
                          <input 
                            type="number"
                            value={newKitPrice}
                            onChange={(e) => setNewKitPrice(e.target.value)}
                            placeholder="0,00"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Adicionar Itens ao Kit</label>
                        <div className="flex gap-2 mb-4">
                          <select 
                            className="flex-1 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                            id="productSelect"
                          >
                            <option value="">Selecione um produto...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <input 
                            type="number" 
                            id="qtyInput"
                            placeholder="Qtd"
                            className="w-24 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button 
                            onClick={() => {
                              const pId = (document.getElementById('productSelect') as HTMLSelectElement).value;
                              const qty = parseInt((document.getElementById('qtyInput') as HTMLInputElement).value);
                              if (pId && qty > 0) {
                                setKitItems([...kitItems, { productId: pId, quantity: qty }]);
                              }
                            }}
                            className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors"
                          >
                            <Plus size={24} />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {kitItems.map((item, idx) => {
                            const prod = products.find(p => p.id === item.productId);
                            return (
                              <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                                <span className="capitalize text-gray-700">{prod?.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-gray-900">{item.quantity} un</span>
                                  <button 
                                    onClick={() => setKitItems(kitItems.filter((_, i) => i !== idx))}
                                    className="text-red-400 hover:text-red-600"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button 
                        disabled={!newKitName || kitItems.length === 0}
                        onClick={saveKit}
                        className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
                      >
                        Salvar Kit no Cardápio
                      </button>
                    </div>
                  </motion.section>
                )}

                {configSubTab === 'lista' && (
                  <motion.div 
                    key="list-all"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-8"
                  >
                    {/* Products List */}
                    <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">Marmitas e Salgados</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {products.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <div className="flex flex-col">
                              <span className="capitalize text-gray-700 font-medium">{p.name}</span>
                              <span className="text-xs font-bold text-emerald-600">R$ {p.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <button 
                              onClick={() => deleteProduct(p.id)}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Kits List */}
                    <section className="space-y-4">
                      <h2 className="text-xl font-bold text-gray-900">Kits Cadastrados</h2>
                      {kits.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">Nenhum kit cadastrado.</p>
                      ) : (
                        kits.map(kit => (
                          <div key={kit.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex flex-col">
                                <h3 className="font-bold text-gray-900 text-lg capitalize">{kit.name}</h3>
                                <span className="text-xs font-bold text-emerald-600">R$ {kit.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <button 
                                onClick={() => deleteKit(kit.id)}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {kit.items.map((item, idx) => {
                                const prod = products.find(p => p.id === item.productId);
                                return (
                                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-500">
                                    <ChevronRight size={14} className="text-emerald-500" />
                                    <span className="capitalize">{prod?.name}</span>
                                    <span className="font-bold text-gray-700">({item.quantity} un)</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'compras' && (
            <motion.div 
              key="compras"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Sub-tabs for Shopping */}
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto">
                {(['lista', 'produtos', 'fornecedores'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => {
                      setShoppingSubTab(sub);
                      setGeneratedList(null);
                    }}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      shoppingSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'lista' && 'Criar Lista'}
                    {sub === 'produtos' && 'Produtos'}
                    {sub === 'fornecedores' && 'Fornecedores'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {shoppingSubTab === 'fornecedores' && (
                  <motion.section 
                    key="shopping-suppliers"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <UserPlus className="text-emerald-600" size={24} /> Cadastrar Fornecedor
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input 
                          type="text"
                          value={newSupplier.name}
                          onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                          placeholder="Nome"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input 
                          type="text"
                          value={newSupplier.location}
                          onChange={(e) => setNewSupplier({...newSupplier, location: e.target.value})}
                          placeholder="Local"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input 
                          type="text"
                          value={newSupplier.contact}
                          onChange={(e) => setNewSupplier({...newSupplier, contact: e.target.value})}
                          placeholder="Contato"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button 
                        onClick={saveSupplier}
                        className="w-full mt-4 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                      >
                        Salvar Fornecedor
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {suppliers.map(s => (
                        <div key={s.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-gray-900">{s.name}</h3>
                            <p className="text-xs text-gray-400">{s.location} • {s.contact}</p>
                          </div>
                          <button 
                            onClick={() => setDeleteConfirm({ id: s.id, type: 'supplier', name: s.name })}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.section>
                )}

                {shoppingSubTab === 'produtos' && (
                  <motion.section 
                    key="shopping-products"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Package className="text-emerald-600" size={24} /> Cadastrar Produto de Compra
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input 
                          type="text"
                          value={newShoppingProduct.name}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, name: e.target.value})}
                          placeholder="Nome do Produto"
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <select 
                          value={newShoppingProduct.supplierId}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, supplierId: e.target.value})}
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Selecione o Fornecedor...</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <select 
                          value={newShoppingProduct.unit}
                          onChange={(e) => setNewShoppingProduct({...newShoppingProduct, unit: e.target.value})}
                          className="p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Unidade de Medida...</option>
                          <option value="unidade">Unidade</option>
                          <option value="caixa">Caixa</option>
                          <option value="kg">Kg</option>
                          <option value="g">Grama</option>
                          <option value="litro">Litro</option>
                          <option value="pacote">Pacote</option>
                          <option value="mileiro">Mileiro</option>
                        </select>
                      </div>
                      <button 
                        onClick={saveShoppingProduct}
                        className="w-full mt-4 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                      >
                        Salvar Produto
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {shoppingProducts.map(p => {
                        const supplier = suppliers.find(s => s.id === p.supplierId);
                        return (
                          <div key={p.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                            <div>
                              <h3 className="font-bold text-gray-900">{p.name}</h3>
                              <p className="text-xs text-gray-400">Fornecedor: {supplier?.name || 'N/A'} • Un: {p.unit}</p>
                            </div>
                            <button 
                              onClick={() => setDeleteConfirm({ id: p.id, type: 'shoppingProduct', name: p.name })}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.section>
                )}

                {shoppingSubTab === 'lista' && (
                  <motion.section 
                    key="shopping-list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    {!generatedList ? (
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="text-emerald-600" size={24} /> Criar Lista de Compras
                          </h2>
                          <button 
                            onClick={() => setShoppingListItems({})}
                            className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Limpar Seleção
                          </button>
                        </div>

                        <div className="space-y-8 mb-8">
                          {shoppingProducts.length === 0 ? (
                            <p className="text-center py-8 text-gray-400">Nenhum produto cadastrado para compras.</p>
                          ) : (
                            suppliers.map(supplier => {
                              const supplierProducts = shoppingProducts.filter(p => p.supplierId === supplier.id);
                              if (supplierProducts.length === 0) return null;

                              return (
                                <div key={supplier.id} className="space-y-3">
                                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-2">
                                    <Store size={14} className="text-emerald-500" /> {supplier.name}
                                  </h3>
                                  <div className="grid grid-cols-1 gap-2">
                                    {supplierProducts.map(p => (
                                      <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex flex-col">
                                          <p className="font-bold text-gray-900">{p.name}</p>
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700 uppercase w-fit mt-1">
                                            {p.unit}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <button 
                                            onClick={() => setShoppingListItems({
                                              ...shoppingListItems,
                                              [p.id]: Math.max(0, (shoppingListItems[p.id] || 0) - 1)
                                            })}
                                            className="p-2 bg-white rounded-lg text-gray-400 hover:text-emerald-600 shadow-sm"
                                          >
                                            <Minus size={16} />
                                          </button>
                                          <span className="w-8 text-center font-bold text-gray-900">
                                            {shoppingListItems[p.id] || 0}
                                          </span>
                                          <button 
                                            onClick={() => setShoppingListItems({
                                              ...shoppingListItems,
                                              [p.id]: (shoppingListItems[p.id] || 0) + 1
                                            })}
                                            className="p-2 bg-white rounded-lg text-gray-400 hover:text-emerald-600 shadow-sm"
                                          >
                                            <Plus size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <button 
                          onClick={finalizeShoppingList}
                          disabled={Object.values(shoppingListItems).every(v => v === 0)}
                          className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Check size={20} /> Finalizar Lista
                        </button>
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 p-8 rounded-3xl border-2 border-emerald-200 relative"
                      >
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-bold text-emerald-900 flex items-center gap-2">
                            <Check size={20} /> Lista Gerada
                          </h3>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(generatedList);
                              // Simple toast-like feedback could be added here
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-600 rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-100 transition-all"
                          >
                            <Copy size={14} /> Copiar Texto
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-emerald-800 leading-relaxed">
                          {generatedList}
                        </pre>
                        <button 
                          onClick={() => setGeneratedList(null)}
                          className="w-full mt-8 py-3 bg-white text-emerald-600 rounded-xl font-bold border border-emerald-200 hover:bg-emerald-100 transition-all"
                        >
                          Voltar e Editar
                        </button>
                      </motion.div>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'contas' && (
            <motion.div 
              key="contas"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex p-1 bg-gray-100 rounded-2xl w-full max-w-2xl mx-auto overflow-x-auto no-scrollbar">
                {(['lista', 'pagas', 'cadastrar'] as const).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setBillsSubTab(sub)}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                      billsSubTab === sub 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {sub === 'lista' ? 'Contas a Pagar' : sub === 'pagas' ? 'Contas Pagas' : 'Cadastrar Conta'}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {billsSubTab === 'cadastrar' && (
                  <motion.section 
                    key="cadastrar-conta"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="max-w-2xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6"
                  >
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Wallet className="text-emerald-600" size={24} /> Nova Conta
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-2">NOME DA CONTA</label>
                        <input 
                          type="text"
                          value={newBill.name}
                          onChange={(e) => setNewBill({...newBill, name: e.target.value})}
                          placeholder="Ex: Aluguel, Energia, Fornecedor X"
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 ml-2">VALOR (R$)</label>
                          <input 
                            type="number"
                            value={newBill.value}
                            onChange={(e) => setNewBill({...newBill, value: e.target.value})}
                            placeholder="0,00"
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-400 ml-2">VENCIMENTO</label>
                          <input 
                            type="date"
                            value={newBill.dueDate}
                            onChange={(e) => setNewBill({...newBill, dueDate: e.target.value})}
                            className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 ml-2">BOLETO OU PIX (OPCIONAL)</label>
                        <textarea 
                          value={newBill.paymentCode}
                          onChange={(e) => setNewBill({...newBill, paymentCode: e.target.value})}
                          placeholder="Cole aqui o código do boleto ou a chave PIX"
                          className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                        />
                      </div>
                      <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <input 
                          type="checkbox"
                          checked={newBill.isRecurring}
                          onChange={(e) => setNewBill({...newBill, isRecurring: e.target.checked})}
                          className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <Repeat size={16} className="text-emerald-600" /> Conta Recorrente (Mensal)
                        </div>
                      </label>
                    </div>
                    <button 
                      onClick={saveBill}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Salvar Conta
                    </button>
                  </motion.section>
                )}

                {billsSubTab === 'lista' && (
                  <motion.section 
                    key="lista-contas"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {bills.filter(b => !b.isPaid).length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <Check size={48} className="mx-auto text-emerald-200 mb-4" />
                        <p className="text-gray-400 font-medium">Tudo em dia! Nenhuma conta pendente.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {bills.filter(b => !b.isPaid).map(bill => {
                          const dueDate = bill.dueDate.toDate();
                          const isOverdue = dueDate < startOfDay(new Date());
                          
                          return (
                            <div 
                              key={bill.id} 
                              className={`bg-white p-6 rounded-3xl shadow-sm border transition-all ${
                                isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-100'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className={`p-3 rounded-2xl ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {isOverdue ? <AlertTriangle size={24} /> : <Clock size={24} />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-gray-900">{bill.name}</h3>
                                      {bill.isRecurring && <Repeat size={14} className="text-emerald-500" />}
                                    </div>
                                    <p className="text-lg font-black text-emerald-600">
                                      {bill.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                    <p className={`text-xs font-bold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                      Vencimento: {format(dueDate, 'dd/MM/yyyy')}
                                      {isOverdue && ' (ATRASADA)'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {bill.paymentCode && (
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(bill.paymentCode);
                                      }}
                                      className="p-3 bg-gray-50 text-gray-500 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition-all flex items-center gap-2 text-xs font-bold"
                                      title="Copiar Código"
                                    >
                                      <Copy size={16} /> Copiar Código
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => toggleBillStatus(bill)}
                                    className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all"
                                  >
                                    Marcar como Paga
                                  </button>
                                  <button 
                                    onClick={() => setDeleteConfirm({ id: bill.id, type: 'bill', name: bill.name })}
                                    className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.section>
                )}

                {billsSubTab === 'pagas' && (
                  <motion.section 
                    key="contas-pagas"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {bills.filter(b => b.isPaid).length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <CreditCard size={48} className="mx-auto text-gray-200 mb-4" />
                        <p className="text-gray-400 font-medium">Nenhuma conta paga ainda.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {bills.filter(b => b.isPaid).map(bill => {
                          const dueDate = bill.dueDate.toDate();
                          
                          return (
                            <div 
                              key={bill.id} 
                              className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 opacity-75"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600">
                                    <Check size={24} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-bold text-gray-900 line-through">{bill.name}</h3>
                                      {bill.isRecurring && <Repeat size={14} className="text-emerald-500" />}
                                    </div>
                                    <p className="text-lg font-black text-gray-400">
                                      {bill.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                    <p className="text-xs font-bold text-gray-400">
                                      Vencimento: {format(dueDate, 'dd/MM/yyyy')} (PAGA)
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => toggleBillStatus(bill)}
                                    className="px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold text-sm hover:bg-emerald-100 transition-all"
                                  >
                                    Estornar
                                  </button>
                                  <button 
                                    onClick={() => setDeleteConfirm({ id: bill.id, type: 'bill', name: bill.name })}
                                    className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Deletion Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
              >
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="text-red-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Confirmar Exclusão</h2>
                <p className="text-gray-500 text-center mb-8">
                  Tem certeza que deseja excluir <span className="font-bold text-gray-900 capitalize">"{deleteConfirm.name}"</span>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                  >
                    Excluir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
