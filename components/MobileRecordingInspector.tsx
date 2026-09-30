import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Smartphone, 
  Layers, 
  Copy, 
  CheckCircle2, 
  ArrowRight, 
  ChevronRight, 
  Target, 
  MousePointer, 
  FileCode,
  Search,
  RotateCcw,
  Sparkles,
  Zap,
  Send,
  Camera,
  Paperclip,
  Phone,
  Video,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Utensils,
  Globe,
  Settings,
  MessageSquare,
  Activity,
  Check,
  ChevronDown,
  Lock,
  RefreshCw,
  Sliders,
  DollarSign,
  Heart,
  Share2,
  Bookmark,
  ExternalLink,
  Shield,
  Wifi,
  Battery,
  Maximize2,
  Minimize2,
  Menu,
  X,
  Star,
  Trash2,
  QrCode,
  PenTool,
  Compass,
  Info,
  LogOut,
  LogIn,
  Truck,
  Filter,
  CheckCircle,
  AlertTriangle,
  Calculator,
  Divide,
  Percent,
  History,
  Clock,
  ArrowLeftRight,
  Delete,
  RotateCw,
  Mail,
  ShieldCheck,
  ArrowLeft,
  Package,
  PhoneCall,
  FileText,
  MapPin,
  Mic,
  MoreVertical,
  Square,
  Play,
  Pause,
  Download,
  Folder,
  Moon,
  Sun,
  Terminal,
  Flame,
  Radio,
  Bell,
  CheckSquare,
  SlidersHorizontal,
  Edit3,
  GraduationCap,
  BookOpen,
  Award,
  FileQuestion,
  HelpCircle,
  User
} from 'lucide-react';
import { toast } from 'sonner';
import { getAppMetadata, AppMetadata } from '../services/mobileAppDefinitionService';
import { getSauceProductImage, SAUCE_LABS_ASSETS, WDIO_ASSETS, FDROID_ASSETS, getApkAssets } from '../services/apkExtractorService';

export interface MobileElementInfo {
  id: string;
  name: string;
  type: string;
  resourceId: string;
  accessibilityId?: string;
  contentDescription?: string;
  xpath: string;
  bounds: string;
  text?: string;
  screen?: string;
  clickable?: boolean;
  enabled?: boolean;
}

interface MobileRecordingInspectorProps {
  isRecording: boolean;
  isPaused: boolean;
  mobileDevice: string;
  mobilePackageName: string;
  mobileAppName?: string;
  mobileApkName?: string;
  mobileAppActivity?: string;
  mobileUserEmail?: string;
  liveMobileFrame?: string | null;
  availableApps?: any[];
  onSwitchApp?: (appPackage: string) => void;
  onRecordElement: (
    elem: MobileElementInfo, 
    action?: 'click' | 'fill' | 'assertion' | 'long_press' | 'swipe',
    value?: string,
    event?: React.MouseEvent | React.SyntheticEvent | any,
    extraMetrics?: {
      targetBox?: { x: number; y: number; width: number; height: number };
      coordinates?: { x: number; y: number };
      /** Upgrade an already-captured step to its resolved UI node without
       *  gesturing on the device again. */
      recordOnly?: boolean;
    }
  ) => void;
  onAddCustomAssertion: () => void;
  onAddWait: () => void;
  onDownloadAgent: () => void;
  onMinimize: () => void;
  touchRipples: { id: number; x: number; y: number }[];
  triggerTouchRipple: (x: number, y: number) => void;
}

interface SauceProduct {
  id: string;
  name: string;
  price: number;
  rating: number;
  reviews: number;
  desc: string;
  color: string;
  badge?: string;
  iconBg: string;
}

const SAUCE_PRODUCTS: SauceProduct[] = [
  {
    id: 'backpack',
    name: 'Sauce Lab Back Packs',
    price: 29.99,
    rating: 4.8,
    reviews: 142,
    desc: 'carry.allTheThings() with the sleek, streamlined Sly Pack. A spacious main compartment holds laptops up to 15 inches with protective padding.',
    color: 'Red',
    badge: 'BESTSELLER',
    iconBg: 'from-red-600 to-rose-700'
  },
  {
    id: 'bikelight',
    name: 'Sauce Lab Bike Light',
    price: 9.99,
    rating: 4.5,
    reviews: 89,
    desc: "A red light isn't the desired state in software testing, but it is with this water-resistant commuter bike light with 3 flash modes.",
    color: 'Red',
    iconBg: 'from-amber-600 to-orange-700'
  },
  {
    id: 'bolt_tshirt',
    name: 'Sauce Lab Bolt T-Shirt',
    price: 15.99,
    rating: 4.7,
    reviews: 210,
    desc: 'Get your testing superhero on with the Sauce Labs bolt T-shirt. 100% combed ringspun cotton for all-day coding comfort.',
    color: 'Black',
    iconBg: 'from-blue-600 to-indigo-700'
  },
  {
    id: 'fleece_jacket',
    name: 'Sauce Lab Fleece Jacket',
    price: 49.99,
    rating: 4.9,
    reviews: 64,
    desc: "It's not every day that you come across a midweight quarter-zip fleece jacket capable of handling chilly data centers or late-night sprints.",
    color: 'Gray',
    iconBg: 'from-slate-700 to-slate-900'
  },
  {
    id: 'onesie',
    name: 'Sauce Lab Onesie',
    price: 7.99,
    rating: 4.6,
    reviews: 45,
    desc: 'Rib snaps at bottom for easy diaper change. Reinforced 3-snap closure for future junior test automation engineers.',
    color: 'Red',
    iconBg: 'from-pink-600 to-rose-600'
  },
  {
    id: 'all_the_things',
    name: 'Test.allTheThings() T-Shirt',
    price: 15.99,
    rating: 4.4,
    reviews: 118,
    desc: 'This classic Sauce Labs red t-shirt is perfect for all the things: unit testing, integration tests, and Playwright / Appium automation.',
    color: 'Red',
    iconBg: 'from-emerald-600 to-teal-700'
  }
];

export const MobileRecordingInspector: React.FC<MobileRecordingInspectorProps> = ({
  isRecording,
  isPaused,
  mobileDevice,
  mobilePackageName,
  mobileAppName,
  mobileApkName,
  mobileAppActivity,
  mobileUserEmail,
  liveMobileFrame,
  availableApps = [],
  onSwitchApp,
  onRecordElement,
  onAddCustomAssertion,
  onAddWait,
  onDownloadAgent,
  onMinimize,
  touchRipples,
  triggerTouchRipple
}) => {
  const pkg = mobilePackageName || 'com.saucelabs.mydemoapp.android';
  
  // App metadata & archetype resolution
  const appMeta: AppMetadata = useMemo(() => {
    return getAppMetadata(pkg, mobileAppName, mobileApkName, mobileAppActivity);
  }, [pkg, mobileAppName, mobileApkName, mobileAppActivity]);

  // Screen Tab State (reset when app changes)
  const [activeTab, setActiveTab] = useState<string>(appMeta.defaultTab);

  // Reference to the phone screen viewport container for exact relative coordinate computation
  const phoneScreenRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle state for the emulator
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // App launch simulation state
  const [isLaunchingApp, setIsLaunchingApp] = useState<boolean>(false);
  const [launchStepText, setLaunchStepText] = useState<string>('');
  const [launchProgress, setLaunchProgress] = useState<number>(100);

  // Reset tab and play launch animation whenever target package changes
  useEffect(() => {
    setActiveTab(appMeta.defaultTab);
    setSelectedElement(null);
    setHoveredElement(null);
    
    // Dynamic app boot sequence
    setIsLaunchingApp(true);
    setLaunchProgress(15);
    setLaunchStepText(`[ADB] Connecting to ${mobileDevice || 'emulator-5554'}...`);

    const t1 = setTimeout(() => {
      setLaunchProgress(45);
      setLaunchStepText(`[ADB] Verifying package ${pkg} on device...`);
    }, 400);

    const t2 = setTimeout(() => {
      setLaunchProgress(75);
      setLaunchStepText(`[ADB] Launching activity: adb shell am start -n ${pkg}/${appMeta.launchActivity}`);
    }, 850);

    const t3 = setTimeout(() => {
      setLaunchProgress(100);
      setLaunchStepText(`[Appium] UiAutomator2 driver session active. App loaded!`);
    }, 1300);

    const t4 = setTimeout(() => {
      setIsLaunchingApp(false);
      toast.success(`Launched ${appMeta.displayName} on Android Emulator!`);
    }, 1600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [pkg, mobileApkName]);

  // Inspector States
  const [isInspectorActive, setIsInspectorActive] = useState<boolean>(true);
  const [inspectorMode, setInspectorMode] = useState<'tap' | 'type' | 'assert' | 'long_press'>('tap');
  const [inspectorInputText, setInspectorInputText] = useState<string>('standard_user');
  const [selectedElement, setSelectedElement] = useState<MobileElementInfo | null>(null);
  const [hoveredElement, setHoveredElement] = useState<MobileElementInfo | null>(null);
  const [hierarchyFilter, setHierarchyFilter] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ================= SAUCE LABS MOBILE APP INTERACTIVE STATES =================
  const [sauceActiveView, setSauceActiveView] = useState<'catalog' | 'details' | 'cart' | 'checkout_address' | 'checkout_payment' | 'checkout_review' | 'checkout_complete' | 'login' | 'webview' | 'qr_scanner' | 'drawing'>('catalog');
  const [sauceDrawerOpen, setSauceDrawerOpen] = useState<boolean>(false);
  const [sauceSelectedProduct, setSauceSelectedProduct] = useState<SauceProduct>(SAUCE_PRODUCTS[0]);
  const [sauceProductQuantity, setSauceProductQuantity] = useState<number>(1);
  const [sauceSelectedColor, setSauceSelectedColor] = useState<string>('Red');
  const [sauceSortOption, setSauceSortOption] = useState<'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'>('name_asc');
  const [sauceShowSortModal, setSauceShowSortModal] = useState<boolean>(false);
  const [sauceSearchFilter, setSauceSearchFilter] = useState<string>('');

  // Cart state: items in cart
  const [sauceCart, setSauceCart] = useState<Array<{ product: SauceProduct; quantity: number; color: string }>>([
    { product: SAUCE_PRODUCTS[0], quantity: 1, color: 'Red' }
  ]);

  // Checkout address
  const [sauceAddress, setSauceAddress] = useState({
    fullName: 'Sowbarnya QA',
    address1: '116 New Montgomery St',
    address2: 'Suite 300',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'United States'
  });

  // Checkout payment
  const [saucePayment, setSaucePayment] = useState({
    cardName: 'Sowbarnya QA',
    cardNumber: '4532 8900 1234 5678',
    cardExp: '08/28',
    cardCvv: '890'
  });

  // Login state
  const [sauceLoginUsername, setSauceLoginUsername] = useState<string>('standard_user');
  const [sauceLoginPassword, setSauceLoginPassword] = useState<string>('secret_sauce');
  const [sauceIsLoggedIn, setSauceIsLoggedIn] = useState<boolean>(false);
  const [sauceLoginError, setSauceLoginError] = useState<string>('');
  const [sauceBiometrics, setSauceBiometrics] = useState<boolean>(true);

  // Cart calculations
  const sauceCartCount = useMemo(() => {
    return sauceCart.reduce((sum, item) => sum + item.quantity, 0);
  }, [sauceCart]);

  const sauceSubtotal = useMemo(() => {
    return sauceCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  }, [sauceCart]);

  const sauceTax = 2.40;
  const sauceTotal = (sauceSubtotal + (sauceCart.length > 0 ? sauceTax : 0)).toFixed(2);

  // Sorted and filtered products
  const displayedProducts = useMemo(() => {
    let list = [...SAUCE_PRODUCTS];
    if (sauceSearchFilter.trim()) {
      const q = sauceSearchFilter.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q));
    }
    if (sauceSortOption === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sauceSortOption === 'name_desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sauceSortOption === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sauceSortOption === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    }
    return list;
  }, [sauceSearchFilter, sauceSortOption]);

  const toggleSauceCartItem = (product: SauceProduct) => {
    const existingIndex = sauceCart.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      setSauceCart(prev => prev.filter(item => item.product.id !== product.id));
      toast.info(`Removed "${product.name}" from Cart`);
    } else {
      setSauceCart(prev => [...prev, { product, quantity: 1, color: 'Red' }]);
      toast.success(`Added "${product.name}" to Cart!`);
    }
  };

  const isProductInCart = (productId: string) => {
    return sauceCart.some(item => item.product.id === productId);
  };

  // Sync activeTab with sauceActiveView when user clicks tab pills
  useEffect(() => {
    if (appMeta.archetype === 'saucelabs') {
      if (activeTab === 'catalog') setSauceActiveView('catalog');
      else if (activeTab === 'details') setSauceActiveView('details');
      else if (activeTab === 'cart') setSauceActiveView('cart');
      else if (activeTab === 'checkout') setSauceActiveView('checkout_address');
      else if (activeTab === 'login') setSauceActiveView('login');
    }
  }, [activeTab, appMeta.archetype]);

  // ================= OTHER ARCHETYPE STATES =================
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'me' | 'them'; text: string; time: string }>>([
    { sender: 'them', text: 'Hey, are the mobile test suites passing on Android 14?', time: '09:38' },
    { sender: 'me', text: 'Yes, AutomatiQA Appium runner completed all regression flows!', time: '09:40' }
  ]);
  const [chatInputText, setChatInputText] = useState<string>('');
  const [inChatRoom, setInChatRoom] = useState<boolean>(false);
  const [chromeUrl, setChromeUrl] = useState<string>('https://google.com');
  const [chromeSearchQuery, setChromeSearchQuery] = useState<string>('AutomatiQA Test Automation Platform');
  const [cartItemsCount, setCartItemsCount] = useState<number>(2);
  const [foodSearch, setFoodSearch] = useState<string>('Paneer Butter Masala');
  const [shopSearch, setShopSearch] = useState<string>('Wireless Noise Cancelling Headphones');
  const [cartTotal, setCartTotal] = useState<number>(129);
  const [transferAmount, setTransferAmount] = useState<string>('250');
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [genericFormName, setGenericFormName] = useState<string>('Alex Johnson');
  const [genericFormEmail, setGenericFormEmail] = useState<string>('alex.johnson@example.com');
  const [genericFormNotes, setGenericFormNotes] = useState<string>('Automated App Test Step');
  const [genericSwitch1, setGenericSwitch1] = useState<boolean>(true);
  const [genericSearch, setGenericSearch] = useState<string>('');
  const [genericCategory, setGenericCategory] = useState<string>('all');
  const [genericSelectedItemId, setGenericSelectedItemId] = useState<string>('');
  const [genericItemQuantity, setGenericItemQuantity] = useState<number>(1);
  const [genericPassword, setGenericPassword] = useState<string>('••••••••');
  const [genericAddress, setGenericAddress] = useState<string>('1204 Tech Boulevard, Suite 400');
  const [genericCity, setGenericCity] = useState<string>('San Francisco, CA');
  const [genericPostalCode, setGenericPostalCode] = useState<string>('94107');
  const [genericTermsAccepted, setGenericTermsAccepted] = useState<boolean>(true);
  const [genericNotificationToggle, setGenericNotificationToggle] = useState<boolean>(true);
  const [genericDarkModeToggle, setGenericDarkModeToggle] = useState<boolean>(true);
  const [genericBiometricToggle, setGenericBiometricToggle] = useState<boolean>(false);
  const [genericCartCount, setGenericCartCount] = useState<number>(1);

  // ================= QALCULATE CALCULATOR INTERACTIVE STATE =================
  const [calcDisplay, setCalcDisplay] = useState<string>('0');
  const [calcResult, setCalcResult] = useState<string>('0');
  const [calcRadMode, setCalcRadMode] = useState<boolean>(false);
  const [calcInvMode, setCalcInvMode] = useState<boolean>(false);
  const [calcMemory, setCalcMemory] = useState<number>(0);
  const [calcHistoryList, setCalcHistoryList] = useState<Array<{ id: string; expression: string; result: string; timestamp: string }>>([
    { id: 'hist-1', expression: '128 × 45', result: '5760', timestamp: '09:30 AM' },
    { id: 'hist-2', expression: '√(144) + 25', result: '37', timestamp: '09:32 AM' },
    { id: 'hist-3', expression: '15% × 850', result: '127.5', timestamp: '09:35 AM' }
  ]);
  const [calcConvertCategory, setCalcConvertCategory] = useState<'currency' | 'length' | 'weight' | 'temp'>('currency');
  const [calcConvertInput, setCalcConvertInput] = useState<string>('100');
  const [calcConvertFrom, setCalcConvertFrom] = useState<string>('USD');
  const [calcConvertTo, setCalcConvertTo] = useState<string>('EUR');

  // Math evaluator helper
  const evaluateCalcMath = (expr: string, isRad = false): string => {
    if (!expr || expr.trim() === '' || expr === '0') return '0';
    try {
      let sanitized = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, `${Math.PI}`)
        .replace(/e/g, `${Math.E}`);
      
      sanitized = sanitized.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
      sanitized = sanitized.replace(/√(\d+(\.\d+)?)/g, 'Math.sqrt($1)');
      sanitized = sanitized.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)');

      if (isRad) {
        sanitized = sanitized.replace(/sin\(([^)]+)\)/g, 'Math.sin($1)');
        sanitized = sanitized.replace(/cos\(([^)]+)\)/g, 'Math.cos($1)');
        sanitized = sanitized.replace(/tan\(([^)]+)\)/g, 'Math.tan($1)');
      } else {
        sanitized = sanitized.replace(/sin\(([^)]+)\)/g, 'Math.sin(($1) * Math.PI / 180)');
        sanitized = sanitized.replace(/cos\(([^)]+)\)/g, 'Math.cos(($1) * Math.PI / 180)');
        sanitized = sanitized.replace(/tan\(([^)]+)\)/g, 'Math.tan(($1) * Math.PI / 180)');
      }

      sanitized = sanitized.replace(/log\(([^)]+)\)/g, 'Math.log10($1)');
      sanitized = sanitized.replace(/ln\(([^)]+)\)/g, 'Math.log($1)');
      sanitized = sanitized.replace(/\^/g, '**');

      if (!/^[0-9+\-*/().\s,Mathsincoetalgbpqwer**]+$/.test(sanitized)) {
        return 'Error';
      }

      const res = Function(`'use strict'; return (${sanitized})`)();
      if (typeof res !== 'number' || isNaN(res) || !isFinite(res)) {
        return 'Error';
      }
      const rounded = Number(Math.round(Number(res + 'e+8')) + 'e-8');
      return String(rounded);
    } catch {
      return '...';
    }
  };

  // Convert helper
  const calcConvertedResult = useMemo(() => {
    const val = parseFloat(calcConvertInput) || 0;
    if (calcConvertCategory === 'currency') {
      const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.2, JPY: 155.4, CAD: 1.36 };
      const fromRate = rates[calcConvertFrom] || 1;
      const toRate = rates[calcConvertTo] || 1;
      return ((val / fromRate) * toRate).toFixed(2);
    }
    if (calcConvertCategory === 'length') {
      const toMeters: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, mi: 1609.34 };
      const base = val * (toMeters[calcConvertFrom] || 1);
      const res = base / (toMeters[calcConvertTo] || 1);
      return res >= 1000 || (res < 0.01 && res > 0) ? res.toExponential(4) : res.toFixed(3);
    }
    if (calcConvertCategory === 'weight') {
      const toKg: Record<string, number> = { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495 };
      const base = val * (toKg[calcConvertFrom] || 1);
      const res = base / (toKg[calcConvertTo] || 1);
      return res.toFixed(3);
    }
    if (calcConvertCategory === 'temp') {
      let celsius = val;
      if (calcConvertFrom === '°F') celsius = (val - 32) * (5 / 9);
      if (calcConvertFrom === 'K') celsius = val - 273.15;
      
      let out = celsius;
      if (calcConvertTo === '°F') out = (celsius * (9 / 5)) + 32;
      if (calcConvertTo === 'K') out = celsius + 273.15;
      return out.toFixed(2);
    }
    return String(val);
  }, [calcConvertInput, calcConvertCategory, calcConvertFrom, calcConvertTo]);

  // ================= WEBDRIVERIO NATIVE DEMO APP INTERACTIVE STATES =================
  const [wdioLoginEmail, setWdioLoginEmail] = useState<string>('alice@example.com');
  const [wdioLoginPassword, setWdioLoginPassword] = useState<string>('12345678');
  const [wdioRepeatPassword, setWdioRepeatPassword] = useState<string>('12345678');
  const [wdioLoginSegment, setWdioLoginSegment] = useState<'login' | 'signup'>('login');
  const [wdioBiometricEnabled, setWdioBiometricEnabled] = useState<boolean>(false);
  const [wdioFormInputText, setWdioFormInputText] = useState<string>('');
  const [wdioFormSwitch, setWdioFormSwitch] = useState<boolean>(false);
  const [wdioFormDropdownValue, setWdioFormDropdownValue] = useState<string>('webdriver.io is awesome');
  const [wdioSwipeCardIndex, setWdioSwipeCardIndex] = useState<number>(0);
  const [wdioFoundSecret, setWdioFoundSecret] = useState<boolean>(false);
  const [wdioDragPlaced, setWdioDragPlaced] = useState<Record<number, boolean>>({});
  const [wdioActiveDialog, setWdioActiveDialog] = useState<{ title: string; message: string } | null>(null);

  // ================= HEALTH INSURANCE & NIVA CARE INTERACTIVE STATE =================
  const [nivaSearchHospital, setNivaSearchHospital] = useState<string>('');
  const [nivaCashlessOnly, setNivaCashlessOnly] = useState<boolean>(true);
  const [nivaClaimPolicyNo, setNivaClaimPolicyNo] = useState<string>('NIVA-8849204-IND');
  const [nivaClaimMember, setNivaClaimMember] = useState<string>('Alex Johnson (Self - Primary)');
  const [nivaClaimHospital, setNivaClaimHospital] = useState<string>('Max Super Speciality Hospital, Saket');
  const [nivaClaimDate, setNivaClaimDate] = useState<string>('2026-08-26');
  const [nivaClaimAmount, setNivaClaimAmount] = useState<string>('45,000');
  const [nivaClaimDiagnosis, setNivaClaimDiagnosis] = useState<string>('Viral Fever & Acute Infection');
  const [nivaClaimType, setNivaClaimType] = useState<'cashless' | 'reimbursement'>('cashless');
  const [nivaSubmittedClaims, setNivaSubmittedClaims] = useState<Array<{ id: string; hospital: string; amount: string; status: string; date: string }>>([
    { id: 'CLM-99120', hospital: 'Max Super Speciality Hospital, Saket', amount: '₹45,000', status: 'Pre-Auth Approved', date: 'Today, 10:15 AM' }
  ]);
  const [nivaStepCount, setNivaStepCount] = useState<number>(6840);
  const [nivaSelectedDoctor, setNivaSelectedDoctor] = useState<string | null>(null);

  // ================= APIDEMOS (ANDROID SDK SAMPLE APP) INTERACTIVE STATE =================
  const [apiDemosPath, setApiDemosPath] = useState<string[]>(['API Demos']);
  const [apiDemosSearch, setApiDemosSearch] = useState<string>('');
  const [apiDemosToggleBtn, setApiDemosToggleBtn] = useState<boolean>(true);
  const [apiDemosCheckbox1, setApiDemosCheckbox1] = useState<boolean>(true);
  const [apiDemosCheckbox2, setApiDemosCheckbox2] = useState<boolean>(false);
  const [apiDemosRadio, setApiDemosRadio] = useState<string>('radio1');
  const [apiDemosRating, setApiDemosRating] = useState<number>(3.5);
  const [apiDemosSeekBar, setApiDemosSeekBar] = useState<number>(65);
  const [apiDemosSpinner, setApiDemosSpinner] = useState<string>('Earth');
  const [apiDemosEditText, setApiDemosEditText] = useState<string>('Hello Android');
  const [apiDemosDialogMsg, setApiDemosDialogMsg] = useState<string | null>(null);
  const [apiDemosShowDialog, setApiDemosShowDialog] = useState<boolean>(false);

  // ================= MACHAXI SPORTS & VENUES INTERACTIVE STATE =================
  const [machaxiSelectedSport, setMachaxiSelectedSport] = useState<string>('badminton');
  const [machaxiSelectedVenue, setMachaxiSelectedVenue] = useState<string>('HSR Layout Arena');
  const [machaxiSelectedSlot, setMachaxiSelectedSlot] = useState<string>('06:00 PM - 07:00 PM');
  const [machaxiCourtBooked, setMachaxiCourtBooked] = useState<boolean>(false);

  // ================= SOUND RECORDER (DANIEL KIM) INTERACTIVE STATE =================
  const [soundRecIsRecording, setSoundRecIsRecording] = useState<boolean>(false);
  const [soundRecSeconds, setSoundRecSeconds] = useState<number>(0);
  const [soundRecPlayingId, setSoundRecPlayingId] = useState<string | null>(null);
  const [soundRecSavedList, setSoundRecSavedList] = useState<Array<{ id: string; name: string; length: string; size: string; date: string }>>([
    { id: 'rec-1', name: 'My Recording 1.mp4', length: '00:45', size: '1.2 MB', date: 'Aug 26, 2026' },
    { id: 'rec-2', name: 'Meeting Notes.mp4', length: '01:20', size: '2.4 MB', date: 'Aug 25, 2026' },
    { id: 'rec-3', name: 'Voice Memo 3.mp4', length: '00:28', size: '780 KB', date: 'Aug 24, 2026' }
  ]);

  // Real-time chronometer ticker when recording
  useEffect(() => {
    let timer: any = null;
    if (soundRecIsRecording) {
      timer = setInterval(() => {
        setSoundRecSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [soundRecIsRecording]);

  const formatSoundRecTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ================= F-DROID OPEN SOURCE APP STORE INTERACTIVE STATE =================
  const [fdroidActiveTab, setFdroidActiveTab] = useState<'latest' | 'categories' | 'nearby' | 'updates' | 'settings'>('latest');
  const [fdroidSearchQuery, setFdroidSearchQuery] = useState<string>('');
  const [fdroidSelectedCategory, setFdroidSelectedCategory] = useState<string | null>(null);
  const [fdroidSelectedApp, setFdroidSelectedApp] = useState<any | null>(null);
  const [fdroidInstalledApps, setFdroidInstalledApps] = useState<Record<string, boolean>>({
    'org.schabi.newpipe': true,
    'com.termux': false,
    'org.videolan.vlc': true,
    'net.osmand.plus': false,
    'com.beemdevelopment.aegis': false,
    'im.vector.app': false,
    'org.mozilla.fennec_fdroid': true,
    'org.briarproject.briar.android': false,
    'de.danoeh.antennapod': true,
    'com.aurora.store': false
  });
  const [fdroidInstallingProgress, setFdroidInstallingProgress] = useState<Record<string, number>>({});
  const [fdroidShowRepoModal, setFdroidShowRepoModal] = useState<boolean>(false);
  const [fdroidRepoToggles, setFdroidRepoToggles] = useState<Record<string, boolean>>({
    'F-Droid Main Repository': true,
    'F-Droid Archive': false,
    'Guardian Project Official': true,
    'Briar Project Official': true
  });
  const [fdroidWifiOnly, setFdroidWifiOnly] = useState<boolean>(true);
  const [fdroidAutoUpdateInterval, setFdroidAutoUpdateInterval] = useState<string>('Daily');
  const [fdroidThemeDark, setFdroidThemeDark] = useState<boolean>(true);

  // F-Droid static catalog
  const fdroidAppList = useMemo(() => [
    {
      id: 'org.schabi.newpipe',
      name: 'NewPipe',
      summary: 'Lightweight YouTube frontend with background playback',
      category: 'Multimedia',
      version: '0.27.0',
      size: '11.8 MB',
      license: 'GPL-3.0',
      author: 'Team NewPipe',
      iconBg: 'from-rose-600 to-red-700',
      description: 'A libre lightweight streaming front-end for Android. Enjoy seamless video playback with background audio and popup player without proprietary Google Play Services.',
      hasUpdate: true,
      updateVersion: '0.27.2',
      stars: 4.9
    },
    {
      id: 'com.termux',
      name: 'Termux',
      summary: 'Android terminal emulator and Linux environment',
      category: 'Development',
      version: '0.118.1',
      size: '98.5 MB',
      license: 'GPL-3.0',
      author: 'Fredrik Fornwall',
      iconBg: 'from-slate-700 to-slate-900',
      description: 'Termux combines powerful terminal emulation with an extensive Linux package collection. Enjoy the bash and zsh shells, edit files with nano and vim, and access servers over ssh.',
      hasUpdate: false,
      stars: 4.8
    },
    {
      id: 'org.videolan.vlc',
      name: 'VLC',
      summary: 'The best open source video and music player',
      category: 'Multimedia',
      version: '3.5.4',
      size: '34.2 MB',
      license: 'GPL-2.0',
      author: 'VideoLAN',
      iconBg: 'from-amber-500 to-orange-600',
      description: 'VLC media player is a free and open source cross-platform multimedia player that plays most multimedia files as well as discs, devices, and network streaming protocols.',
      hasUpdate: true,
      updateVersion: '3.6.0',
      stars: 4.7
    },
    {
      id: 'net.osmand.plus',
      name: 'OsmAnd~',
      summary: 'Offline global OpenStreetMap navigation and maps',
      category: 'Navigation',
      version: '4.7.10',
      size: '142.1 MB',
      license: 'GPL-3.0',
      author: 'OsmAnd BV',
      iconBg: 'from-orange-500 to-amber-600',
      description: 'OsmAnd is an offline navigation application with access to the free, worldwide, and high-quality OpenStreetMap (OSM) data. Enjoy voice and optical navigation.',
      hasUpdate: false,
      stars: 4.8
    },
    {
      id: 'com.beemdevelopment.aegis',
      name: 'Aegis Authenticator',
      summary: 'Free, secure and open source 2FA authenticator',
      category: 'Security',
      version: '3.1.1',
      size: '16.4 MB',
      license: 'GPL-3.0',
      author: 'Beem Development',
      iconBg: 'from-red-700 to-rose-900',
      description: 'Aegis Authenticator is a free, secure and open source app for Android to manage your 2-step verification tokens. Supports OTP, TOTP, Biometric unlocking, and encrypted backups.',
      hasUpdate: false,
      stars: 4.9
    },
    {
      id: 'im.vector.app',
      name: 'Element (Matrix)',
      summary: 'Secure end-to-end encrypted messaging and collaboration',
      category: 'Connectivity',
      version: '1.6.20',
      size: '52.7 MB',
      license: 'Apache-2.0',
      author: 'Element',
      iconBg: 'from-emerald-600 to-teal-800',
      description: 'Element is both a beautiful and secure messaging and collaboration app built on Matrix. It is open source, private, and end-to-end encrypted.',
      hasUpdate: false,
      stars: 4.6
    },
    {
      id: 'org.mozilla.fennec_fdroid',
      name: 'Fennec F-Droid',
      summary: 'Browse the web without tracking and privacy compromises',
      category: 'Internet',
      version: '128.1.0',
      size: '88.3 MB',
      license: 'MPL-2.0',
      author: 'Mozilla & Relan',
      iconBg: 'from-blue-600 to-indigo-700',
      description: 'Fennec F-Droid is based on the latest Firefox with proprietary binaries and telemetry removed for maximum privacy and freedom.',
      hasUpdate: true,
      updateVersion: '129.0.0',
      stars: 4.7
    },
    {
      id: 'de.danoeh.antennapod',
      name: 'AntennaPod',
      summary: 'Easy-to-use, flexible and open-source podcast manager',
      category: 'Multimedia',
      version: '3.4.1',
      size: '22.0 MB',
      license: 'GPL-3.0',
      author: 'AntennaPod Team',
      iconBg: 'from-blue-500 to-cyan-600',
      description: 'AntennaPod is a podcast manager and player that gives you instant access to millions of free and paid podcasts. Stream and download episodes with custom playback speed.',
      hasUpdate: false,
      stars: 4.9
    }
  ], []);

  // Filtered F-Droid app list
  const displayedFdroidApps = useMemo(() => {
    let list = [...fdroidAppList];
    if (fdroidSearchQuery.trim()) {
      const q = fdroidSearchQuery.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    }
    if (fdroidSelectedCategory) {
      list = list.filter(a => a.category.toLowerCase() === fdroidSelectedCategory.toLowerCase());
    }
    return list;
  }, [fdroidAppList, fdroidSearchQuery, fdroidSelectedCategory]);

  // ================= MALARM MINIMALIST ALARM CLOCK INTERACTIVE STATE =================
  const [malarmAlarms, setMalarmAlarms] = useState<Array<{ id: string; time: string; period: 'AM' | 'PM'; label: string; days: string[]; enabled: boolean; vibration: boolean; ringtone: string }>>([
    { id: 'alarm-1', time: '06:30', period: 'AM', label: 'Morning Standup & Work', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], enabled: true, vibration: true, ringtone: 'Oxygen' },
    { id: 'alarm-2', time: '08:00', period: 'AM', label: 'Weekend Jogging & Gym', days: ['Sat', 'Sun'], enabled: true, vibration: true, ringtone: 'Argon' },
    { id: 'alarm-3', time: '07:15', period: 'AM', label: 'Team Architecture Review', days: ['Mon', 'Wed', 'Fri'], enabled: false, vibration: false, ringtone: 'Krypton' },
    { id: 'alarm-4', time: '10:30', period: 'PM', label: 'Night Routine & Sleep', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], enabled: true, vibration: true, ringtone: 'Helium' }
  ]);
  const [malarmIsAdding, setMalarmIsAdding] = useState<boolean>(false);
  const [malarmEditingId, setMalarmEditingId] = useState<string | null>(null);
  const [malarmNewHour, setMalarmNewHour] = useState<string>('07');
  const [malarmNewMinute, setMalarmNewMinute] = useState<string>('00');
  const [malarmNewPeriod, setMalarmNewPeriod] = useState<'AM' | 'PM'>('AM');
  const [malarmNewLabel, setMalarmNewLabel] = useState<string>('New Alarm');
  const [malarmNewDays, setMalarmNewDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [malarmNewVibrate, setMalarmNewVibrate] = useState<boolean>(true);
  const [malarmNewRingtone, setMalarmNewRingtone] = useState<string>('Oxygen');

  // ================= EDUCATION / MILES EDUCATION APP INTERACTIVE STATES =================
  const [eduSelectedCourseId, setEduSelectedCourseId] = useState<string>('cpa_course');
  const [eduSearchQuery, setEduSearchQuery] = useState<string>('');
  const [eduFilterCategory, setEduFilterCategory] = useState<'all' | 'accounting' | 'finance' | 'analytics'>('all');
  const [eduIsVideoPlaying, setEduIsVideoPlaying] = useState<boolean>(false);
  const [eduActiveVideoChapter, setEduActiveVideoChapter] = useState<string>('FAR 1.1: US GAAP vs IFRS Framework');
  const [eduQuizQuestionIdx, setEduQuizQuestionIdx] = useState<number>(0);
  const [eduSelectedAnswer, setEduSelectedAnswer] = useState<string | null>(null);
  const [eduQuizSubmitted, setEduQuizSubmitted] = useState<boolean>(false);
  const [eduQuizScore, setEduQuizScore] = useState<number>(1);
  const [eduDoubtText, setEduDoubtText] = useState<string>('');
  const [eduEnrolledList, setEduEnrolledList] = useState<string[]>(['cpa_course']);
  const [eduStudentName, setEduStudentName] = useState<string>('Sowbarnya QA');
  const [eduStudentRoll, setEduStudentRoll] = useState<string>('MILES-CPA-2026-8841');

  const eduCoursesList = useMemo(() => [
    {
      id: 'cpa_course',
      name: 'US CPA Master Program',
      code: 'AICPA / Becker Edition',
      category: 'accounting',
      duration: '12 Months • 4 Core Sections',
      rating: 4.9,
      students: '42,000+ Enrolled',
      price: '₹1,25,000',
      badge: 'FLAGSHIP',
      desc: 'Master Auditing (AUD), Financial Accounting & Reporting (FAR), Regulation (REG), and Disciplines (BAR/ISC/TCP) with live interactive lectures by Varun Jain & senior faculty.',
      chapters: [
        'FAR 1.1: US GAAP vs IFRS Framework & Recognition',
        'AUD 2.3: Internal Control & Substantive Testing',
        'REG 3.2: Federal Taxation for C-Corporations & Pass-Throughs',
        'BAR 4.1: Advanced Technical Accounting & Analytics'
      ]
    },
    {
      id: 'cma_course',
      name: 'US CMA Global Certification',
      code: 'IMA Approved',
      category: 'finance',
      duration: '8 Months • 2 Parts',
      rating: 4.8,
      students: '28,500+ Enrolled',
      price: '₹95,000',
      badge: 'GLOBAL CERT',
      desc: 'Strategic financial management, planning, budgeting, cost analysis, and corporate decision making accredited by the Institute of Management Accountants (IMA).',
      chapters: [
        'Part 1: Financial Planning, Performance & Analytics',
        'Part 2: Strategic Financial Management & Corporate Finance'
      ]
    },
    {
      id: 'acca_pathway',
      name: 'ACCA Global Fast-Track Pathway',
      code: 'UK Chartered',
      category: 'accounting',
      duration: '18 Months • Up to 9 Exemptions',
      rating: 4.9,
      students: '19,200+ Enrolled',
      price: '₹85,000',
      badge: 'CAREER BOOST',
      desc: 'International chartered certified accountant qualification recognized across 180+ countries with maximum exam exemptions and Big 4 placement assistance.',
      chapters: [
        'Applied Knowledge: Business & Technology, Management Accounting',
        'Applied Skills: Financial Reporting, Audit & Assurance',
        'Strategic Professional: Essentials & Option Modules'
      ]
    },
    {
      id: 'fin_analytics',
      name: 'Executive Master in Financial Modeling & AI',
      code: 'Practical Lab',
      category: 'analytics',
      duration: '6 Months • Hands-on Project Labs',
      rating: 4.7,
      students: '14,100+ Enrolled',
      price: '₹65,000',
      badge: 'TRENDING',
      desc: 'Comprehensive hands-on training in 3-statement financial modeling, DCF valuation, Power BI analytics dashboards, and Python for quantitative financial risk assessment.',
      chapters: [
        'Module 1: Advanced Excel & Dynamic Three-Statement Modeling',
        'Module 2: M&A and LBO Valuation Modeling',
        'Module 3: Python for Financial Analysis & Risk Simulations'
      ]
    }
  ], []);

  const eduQuizQuestions = useMemo(() => [
    {
      question: 'Under US GAAP (ASC 606), revenue from contracts with customers is recognized when:',
      options: [
        'Cash is physically received from the customer',
        'A performance obligation is satisfied by transferring control of promised goods or services',
        'The sales contract is signed by both authorized parties',
        'The quarterly financial statement is filed with the SEC'
      ],
      correctAnswer: 'A performance obligation is satisfied by transferring control of promised goods or services',
      explanation: 'ASC 606 Step 5 states that revenue is recognized when (or as) the entity satisfies a performance obligation by transferring a promised good or service to the customer.'
    },
    {
      question: 'Which of the following is considered a Temporary Difference in Corporate Tax Accounting (ASC 740)?',
      options: [
        'Tax-exempt municipal bond interest income',
        'Accelerated tax depreciation vs straight-line book depreciation',
        'Fines and penalties paid to governmental authorities',
        'Life insurance proceeds on key officers'
      ],
      correctAnswer: 'Accelerated tax depreciation vs straight-line book depreciation',
      explanation: 'Depreciation timing differences create temporary differences resulting in Deferred Tax Liabilities (DTL) or Deferred Tax Assets (DTA).'
    }
  ], []);

  const displayedEduCourses = useMemo(() => {
    let list = [...eduCoursesList];
    if (eduSearchQuery.trim()) {
      const q = eduSearchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    }
    if (eduFilterCategory !== 'all') {
      list = list.filter(c => c.category === eduFilterCategory);
    }
    return list;
  }, [eduCoursesList, eduSearchQuery, eduFilterCategory]);

  const wdioSwipeCards = [
    { title: 'FULLY OPEN SOURCE', desc: 'WebdriverIO is fully open source and managed by the OpenJS Foundation.', badge: 'OPEN SOURCE' },
    { title: 'GREAT COMMUNITY', desc: 'Join our friendly Discord and GitHub discussion channels for 24/7 help.', badge: 'COMMUNITY' },
    { title: 'JS.FOUNDATION', desc: 'Part of the OpenJS Foundation supporting a healthy JavaScript ecosystem.', badge: 'ECOSYSTEM' },
    { title: 'SUPPORT VIDEOS', desc: 'Watch comprehensive video tutorials on automating mobile apps and browsers.', badge: 'TUTORIALS' },
    { title: 'COMPATIBLE', desc: 'Works seamlessly on Android, iOS, Chrome, Safari, Firefox, and Electron.', badge: 'CROSS-PLATFORM' },
    { title: 'EXTENDABLE', desc: 'Rich ecosystem of plugins and reporter integrations ready for enterprise CI/CD.', badge: 'PLUGINS' }
  ];

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied ${key} to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ================= DYNAMIC UI AUTOMATOR 2 ELEMENTS HIERARCHY =================
  const currentElements: MobileElementInfo[] = useMemo(() => {
    const elements: MobileElementInfo[] = [];
    const p = pkg;

    // 1. SAUCE LABS SAMPLE APP ARCHETYPE
    if (appMeta.archetype === 'saucelabs') {
      // Header navigation elements
      elements.push(
        {
          id: 'elem-sauce-menu-iv',
          name: 'Sauce Labs Hamburger Menu Button',
          type: 'android.widget.ImageView',
          resourceId: `${p}:id/menuIV`,
          accessibilityId: 'open menu',
          xpath: `//android.widget.ImageView[@content-desc="open menu" or @resource-id="${p}:id/menuIV"]`,
          bounds: '[40,75][110,145]',
          text: 'Menu',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-sauce-cart-iv',
          name: `Shopping Cart Action Button (${sauceCartCount} items)`,
          type: 'android.widget.ImageView',
          resourceId: `${p}:id/cartIV`,
          accessibilityId: 'cart badge',
          xpath: `//android.widget.ImageView[@content-desc="cart badge" or @resource-id="${p}:id/cartIV"]`,
          bounds: '[960,75][1030,145]',
          text: `Cart (${sauceCartCount})`,
          clickable: true,
          enabled: true
        }
      );

      if (sauceActiveView === 'catalog') {
        elements.push(
          {
            id: 'elem-sauce-sort-iv',
            name: 'Sort & Filter Products Button',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/sortIV`,
            accessibilityId: 'sort button',
            xpath: `//android.widget.ImageView[@content-desc="sort button" or @resource-id="${p}:id/sortIV"]`,
            bounds: '[890,75][950,145]',
            text: 'Sort',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-search-et',
            name: 'Search Swag Products Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/searchET`,
            accessibilityId: 'search products',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/searchET"]`,
            bounds: '[40,160][1040,240]',
            text: sauceSearchFilter,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-title-tv',
            name: 'Products Section Title',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/productTV`,
            accessibilityId: 'title',
            xpath: `//android.widget.TextView[@text="Products" or @resource-id="${p}:id/productTV"]`,
            bounds: '[40,260][300,320]',
            text: 'Products',
            clickable: false,
            enabled: true
          }
        );

        // Map individual product cards
        displayedProducts.forEach((item, index) => {
          const topY = 340 + (index * 220);
          elements.push(
            {
              id: `elem-sauce-product-${item.id}`,
              name: `Product Card: ${item.name}`,
              type: 'android.widget.TextView',
              resourceId: `${p}:id/titleTV`,
              accessibilityId: item.name,
              xpath: `//android.widget.TextView[@text="${item.name}"]`,
              bounds: `[40,${topY}][800,${topY + 60}]`,
              text: item.name,
              clickable: true,
              enabled: true
            },
            {
              id: `elem-sauce-price-${item.id}`,
              name: `Price: $${item.price} (${item.name})`,
              type: 'android.widget.TextView',
              resourceId: `${p}:id/priceTV`,
              accessibilityId: `$${item.price}`,
              xpath: `//android.widget.TextView[@text="$${item.price}"]`,
              bounds: `[40,${topY + 65}][240,${topY + 115}]`,
              text: `$${item.price}`,
              clickable: false,
              enabled: true
            },
            {
              id: `elem-sauce-btn-cart-${item.id}`,
              name: `${isProductInCart(item.id) ? 'Remove From Cart' : 'Add To Cart'}: ${item.name}`,
              type: 'android.widget.Button',
              resourceId: `${p}:id/cartBt`,
              accessibilityId: `${isProductInCart(item.id) ? 'Remove' : 'Add To Cart'} ${item.name}`,
              xpath: `//android.widget.Button[@content-desc="${isProductInCart(item.id) ? 'Remove' : 'Add To Cart'} ${item.name}" or @resource-id="${p}:id/cartBt"]`,
              bounds: `[780,${topY + 50}][1020,${topY + 120}]`,
              text: isProductInCart(item.id) ? 'Remove' : 'Add to Cart',
              clickable: true,
              enabled: true
            }
          );
        });
      } else if (sauceActiveView === 'details') {
        elements.push(
          {
            id: 'elem-sauce-back-arrow',
            name: 'Back to Catalog Arrow',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/arrowIV`,
            accessibilityId: 'Navigate up',
            xpath: `//android.widget.ImageView[@content-desc="Navigate up"]`,
            bounds: '[40,160][100,220]',
            text: 'Back',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-detail-title',
            name: `Product Title: ${sauceSelectedProduct.name}`,
            type: 'android.widget.TextView',
            resourceId: `${p}:id/productTV`,
            accessibilityId: sauceSelectedProduct.name,
            xpath: `//android.widget.TextView[@text="${sauceSelectedProduct.name}"]`,
            bounds: '[40,240][900,320]',
            text: sauceSelectedProduct.name,
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-sauce-detail-price',
            name: `Product Price: $${sauceSelectedProduct.price}`,
            type: 'android.widget.TextView',
            resourceId: `${p}:id/priceTV`,
            accessibilityId: `$${sauceSelectedProduct.price}`,
            xpath: `//android.widget.TextView[@text="$${sauceSelectedProduct.price}"]`,
            bounds: '[40,330][300,390]',
            text: `$${sauceSelectedProduct.price}`,
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-sauce-detail-desc',
            name: 'Product Full Description',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/descTV`,
            accessibilityId: 'product description',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/descTV"]`,
            bounds: '[40,400][1040,540]',
            text: sauceSelectedProduct.desc,
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-sauce-counter-minus',
            name: 'Decrease Quantity Button',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/minusIV`,
            accessibilityId: 'decrease item quantity',
            xpath: `//android.widget.ImageView[@content-desc="decrease item quantity"]`,
            bounds: '[40,780][120,850]',
            text: '-',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-counter-plus',
            name: 'Increase Quantity Button',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/plusIV`,
            accessibilityId: 'increase item quantity',
            xpath: `//android.widget.ImageView[@content-desc="increase item quantity"]`,
            bounds: '[200,780][280,850]',
            text: '+',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-detail-add-btn',
            name: 'Add to Cart Primary Action',
            type: 'android.widget.Button',
            resourceId: `${p}:id/cartBt`,
            accessibilityId: 'Add To Cart button',
            xpath: `//android.widget.Button[@content-desc="Add To Cart button" or @resource-id="${p}:id/cartBt"]`,
            bounds: '[40,1920][1040,2040]',
            text: `Add To Cart ($${(sauceSelectedProduct.price * sauceProductQuantity).toFixed(2)})`,
            clickable: true,
            enabled: true
          }
        );
      } else if (sauceActiveView === 'cart') {
        elements.push(
          {
            id: 'elem-sauce-cart-title',
            name: 'Your Cart Header',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/productTV`,
            accessibilityId: 'cart title',
            xpath: `//android.widget.TextView[@text="Your Cart" or @resource-id="${p}:id/productTV"]`,
            bounds: '[40,160][400,230]',
            text: 'Your Cart',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-sauce-btn-continue-shopping',
            name: 'Continue Shopping Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/shoppingBt`,
            accessibilityId: 'continue shopping',
            xpath: `//android.widget.Button[@content-desc="continue shopping" or @text="Continue Shopping"]`,
            bounds: '[40,1800][520,1900]',
            text: 'Continue Shopping',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-btn-proceed-checkout',
            name: 'Proceed To Checkout Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/cartBt`,
            accessibilityId: 'Proceed To Checkout',
            xpath: `//android.widget.Button[@content-desc="Proceed To Checkout" or @text="Proceed To Checkout"]`,
            bounds: '[540,1800][1040,1900]',
            text: `Proceed To Checkout ($${sauceTotal})`,
            clickable: true,
            enabled: true
          }
        );
      } else if (sauceActiveView === 'checkout_address') {
        elements.push(
          {
            id: 'elem-sauce-input-fullname',
            name: 'Full Name Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/fullNameET`,
            accessibilityId: 'Full Name* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/fullNameET"]`,
            bounds: '[40,240][1040,320]',
            text: sauceAddress.fullName,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-address1',
            name: 'Address Line 1 Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/address1ET`,
            accessibilityId: 'Address Line 1* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/address1ET"]`,
            bounds: '[40,350][1040,430]',
            text: sauceAddress.address1,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-city',
            name: 'City Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/cityET`,
            accessibilityId: 'City* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/cityET"]`,
            bounds: '[40,460][520,540]',
            text: sauceAddress.city,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-zip',
            name: 'Zip Code Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/zipET`,
            accessibilityId: 'Zip Code* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/zipET"]`,
            bounds: '[540,460][1040,540]',
            text: sauceAddress.zip,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-btn-to-payment',
            name: 'To Payment Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/paymentBtn`,
            accessibilityId: 'To Payment button',
            xpath: `//android.widget.Button[@content-desc="To Payment button" or @text="To Payment"]`,
            bounds: '[40,1920][1040,2040]',
            text: 'To Payment',
            clickable: true,
            enabled: true
          }
        );
      } else if (sauceActiveView === 'checkout_payment') {
        elements.push(
          {
            id: 'elem-sauce-input-card-name',
            name: 'Card Holder Name Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/nameET`,
            accessibilityId: 'Full Name* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/nameET"]`,
            bounds: '[40,240][1040,320]',
            text: saucePayment.cardName,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-card-number',
            name: 'Card Number Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/cardNumberET`,
            accessibilityId: 'Card Number* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/cardNumberET"]`,
            bounds: '[40,350][1040,430]',
            text: saucePayment.cardNumber,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-card-exp',
            name: 'Expiration Date Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/expirationDateET`,
            accessibilityId: 'Expiration Date* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/expirationDateET"]`,
            bounds: '[40,460][520,540]',
            text: saucePayment.cardExp,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-card-cvv',
            name: 'Security Code CVV Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/securityCodeET`,
            accessibilityId: 'Security Code* input field',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/securityCodeET"]`,
            bounds: '[540,460][1040,540]',
            text: saucePayment.cardCvv,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-btn-review-order',
            name: 'Review Order Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/paymentBtn`,
            accessibilityId: 'Review Order button',
            xpath: `//android.widget.Button[@content-desc="Review Order button" or @text="Review Order"]`,
            bounds: '[40,1920][1040,2040]',
            text: 'Review Order',
            clickable: true,
            enabled: true
          }
        );
      } else if (sauceActiveView === 'checkout_review') {
        elements.push(
          {
            id: 'elem-sauce-btn-place-order',
            name: 'Place Order Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/paymentBtn`,
            accessibilityId: 'Place Order button',
            xpath: `//android.widget.Button[@content-desc="Place Order button" or @text="Place Order"]`,
            bounds: '[40,1920][1040,2040]',
            text: `Place Order ($${sauceTotal})`,
            clickable: true,
            enabled: true
          }
        );
      } else if (sauceActiveView === 'login') {
        elements.push(
          {
            id: 'elem-sauce-input-username',
            name: 'Username Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/nameET`,
            accessibilityId: 'Username input field',
            xpath: `//android.widget.EditText[@content-desc="Username input field" or @resource-id="${p}:id/nameET"]`,
            bounds: '[40,320][1040,400]',
            text: sauceLoginUsername,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-input-password',
            name: 'Password Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/passwordET`,
            accessibilityId: 'Password input field',
            xpath: `//android.widget.EditText[@content-desc="Password input field" or @resource-id="${p}:id/passwordET"]`,
            bounds: '[40,440][1040,520]',
            text: sauceLoginPassword,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-btn-login-submit',
            name: 'Login Action Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/loginBtn`,
            accessibilityId: 'Login button',
            xpath: `//android.widget.Button[@content-desc="Login button" or @resource-id="${p}:id/loginBtn"]`,
            bounds: '[40,620][1040,710]',
            text: 'Login',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-user-standard',
            name: 'Quick Fill: standard_user',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/standardUserTV`,
            accessibilityId: 'standard_user',
            xpath: `//android.widget.TextView[@text="standard_user"]`,
            bounds: '[40,800][400,850]',
            text: 'standard_user',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-sauce-user-locked',
            name: 'Quick Fill: locked_out_user',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/lockedUserTV`,
            accessibilityId: 'locked_out_user',
            xpath: `//android.widget.TextView[@text="locked_out_user"]`,
            bounds: '[40,870][420,920]',
            text: 'locked_out_user',
            clickable: true,
            enabled: true
          }
        );
      }
    } else if (appMeta.archetype === 'wdio') {
      // 1.5 WEBDRIVERIO NATIVE DEMO APP ELEMENT HIERARCHY
      // Bottom Navigation Tabs
      elements.push(
        {
          id: 'elem-wdio-tab-home',
          name: 'Home Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Home`,
          accessibilityId: 'Home',
          xpath: `//android.widget.Button[@content-desc="Home"]`,
          bounds: '[0,1800][180,1920]',
          text: 'Home',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-wdio-tab-webview',
          name: 'Webview Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Webview`,
          accessibilityId: 'Webview',
          xpath: `//android.widget.Button[@content-desc="Webview"]`,
          bounds: '[180,1800][360,1920]',
          text: 'Webview',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-wdio-tab-login',
          name: 'Login Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Login`,
          accessibilityId: 'Login',
          xpath: `//android.widget.Button[@content-desc="Login"]`,
          bounds: '[360,1800][540,1920]',
          text: 'Login',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-wdio-tab-forms',
          name: 'Forms Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Forms`,
          accessibilityId: 'Forms',
          xpath: `//android.widget.Button[@content-desc="Forms"]`,
          bounds: '[540,1800][720,1920]',
          text: 'Forms',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-wdio-tab-swipe',
          name: 'Swipe Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Swipe`,
          accessibilityId: 'Swipe',
          xpath: `//android.widget.Button[@content-desc="Swipe"]`,
          bounds: '[720,1800][900,1920]',
          text: 'Swipe',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-wdio-tab-drag',
          name: 'Drag Tab Navigation Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/Drag`,
          accessibilityId: 'Drag',
          xpath: `//android.widget.Button[@content-desc="Drag"]`,
          bounds: '[900,1800][1080,1920]',
          text: 'Drag',
          clickable: true,
          enabled: true
        }
      );

      // Home Screen Elements
      if (activeTab === 'home') {
        elements.push(
          {
            id: 'elem-wdio-home-robot',
            name: 'WebdriverIO Mascot Robot',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/wdio_mascot`,
            accessibilityId: 'WebdriverIO logo',
            xpath: `//android.widget.ImageView[@content-desc="WebdriverIO logo"]`,
            bounds: '[340,240][740,640]',
            text: 'WebdriverIO logo',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-home-title',
            name: 'WEBDRIVER.IO Title',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_title`,
            accessibilityId: 'WEBDRIVER',
            xpath: `//android.widget.TextView[@text="WEBDRIVER"]`,
            bounds: '[200,660][880,740]',
            text: 'WEBDRIVER',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-home-desc',
            name: 'Demo App Description',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_desc`,
            accessibilityId: 'description',
            xpath: `//android.widget.TextView[contains(@text, "Demo app")]`,
            bounds: '[100,760][980,840]',
            text: 'Demo app for the WebdriverIO native app',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-home-btn-webdriver',
            name: 'WEBDRIVER.IO Website Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_website`,
            accessibilityId: 'button-visit-site',
            xpath: `//android.widget.Button[@content-desc="button-visit-site"]`,
            bounds: '[140,880][940,980]',
            text: 'WEBDRIVER.IO',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-home-btn-youtube',
            name: 'YOUTUBE CHANNEL Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_youtube`,
            accessibilityId: 'button-youtube',
            xpath: `//android.widget.Button[@content-desc="button-youtube"]`,
            bounds: '[140,1020][940,1120]',
            text: 'YOUTUBE CHANNEL',
            clickable: true,
            enabled: true
          }
        );
      }

      // Webview Screen Elements
      if (activeTab === 'webview') {
        elements.push(
          {
            id: 'elem-wdio-webview-bar',
            name: 'Webview URL Input Bar',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/url_bar`,
            accessibilityId: 'url-bar',
            xpath: `//android.widget.EditText[@text="https://webdriver.io"]`,
            bounds: '[40,120][1040,200]',
            text: 'https://webdriver.io',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-webview-hero',
            name: 'Webview Hero Heading',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/webview_hero`,
            accessibilityId: 'Next-gen browser and mobile automation',
            xpath: `//android.widget.TextView[contains(@text, "Next-gen")]`,
            bounds: '[60,260][1020,400]',
            text: 'Next-gen browser and mobile automation test framework for Node.js',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-webview-get-started',
            name: 'Get Started Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_get_started`,
            accessibilityId: 'button-Get-Started',
            xpath: `//android.widget.Button[@content-desc="button-Get-Started"]`,
            bounds: '[100,440][500,530]',
            text: 'Get Started',
            clickable: true,
            enabled: true
          }
        );
      }

      // Login Screen Elements
      if (activeTab === 'login') {
        elements.push(
          {
            id: 'elem-wdio-login-tab-login',
            name: 'Login Tab Container',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/login_tab`,
            accessibilityId: 'button-login-container',
            xpath: `//android.view.ViewGroup[@content-desc="button-login-container"]`,
            bounds: '[40,140][530,220]',
            text: 'Login',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-login-tab-signup',
            name: 'Sign up Tab Container',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/signup_tab`,
            accessibilityId: 'button-sign-up-container',
            xpath: `//android.view.ViewGroup[@content-desc="button-sign-up-container"]`,
            bounds: '[550,140][1040,220]',
            text: 'Sign up',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-input-email',
            name: 'Email Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_email`,
            accessibilityId: 'input-email',
            xpath: `//android.widget.EditText[@content-desc="input-email"]`,
            bounds: '[40,260][1040,360]',
            text: wdioLoginEmail,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-input-password',
            name: 'Password Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_password`,
            accessibilityId: 'input-password',
            xpath: `//android.widget.EditText[@content-desc="input-password"]`,
            bounds: '[40,400][1040,500]',
            text: wdioLoginPassword,
            clickable: true,
            enabled: true
          }
        );

        if (wdioLoginSegment === 'signup') {
          elements.push({
            id: 'elem-wdio-input-repeat-password',
            name: 'Confirm Password Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_repeat_password`,
            accessibilityId: 'input-repeat-password',
            xpath: `//android.widget.EditText[@content-desc="input-repeat-password"]`,
            bounds: '[40,540][1040,640]',
            text: wdioRepeatPassword,
            clickable: true,
            enabled: true
          });
        }

        elements.push(
          {
            id: 'elem-wdio-btn-biometric',
            name: 'Biometric Authentication Toggle',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_biometric`,
            accessibilityId: 'button-biometric',
            xpath: `//android.widget.Switch[@content-desc="button-biometric"]`,
            bounds: '[40,680][1040,760]',
            text: 'Biometrics',
            clickable: true,
            enabled: true
          },
          {
            id: wdioLoginSegment === 'signup' ? 'elem-wdio-btn-signup' : 'elem-wdio-btn-login',
            name: wdioLoginSegment === 'signup' ? 'SIGN UP Action Button' : 'LOGIN Action Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_${wdioLoginSegment}`,
            accessibilityId: wdioLoginSegment === 'signup' ? 'button-SIGN UP' : 'button-LOGIN',
            xpath: `//android.widget.Button[@content-desc="${wdioLoginSegment === 'signup' ? 'button-SIGN UP' : 'button-LOGIN'}"]`,
            bounds: '[100,800][980,900]',
            text: wdioLoginSegment === 'signup' ? 'SIGN UP' : 'LOGIN',
            clickable: true,
            enabled: true
          }
        );
      }

      // Forms Screen Elements
      if (activeTab === 'forms') {
        elements.push(
          {
            id: 'elem-wdio-form-title',
            name: 'Form components Section Heading',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_form_title`,
            accessibilityId: 'Form components',
            xpath: `//android.widget.TextView[@text="Form components"]`,
            bounds: '[40,100][600,160]',
            text: 'Form components',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-text-input',
            name: 'Type Something Text Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/text_input`,
            accessibilityId: 'text-input',
            xpath: `//android.widget.EditText[@content-desc="text-input"]`,
            bounds: '[40,200][1040,300]',
            text: wdioFormInputText || 'Type something',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-input-text-result',
            name: 'Live Typed Text Echo Display',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/input_text_result`,
            accessibilityId: 'input-text-result',
            xpath: `//android.widget.TextView[@content-desc="input-text-result"]`,
            bounds: '[40,320][1040,380]',
            text: wdioFormInputText || '',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-switch',
            name: 'Switch Control',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch`,
            accessibilityId: 'switch',
            xpath: `//android.widget.Switch[@content-desc="switch"]`,
            bounds: '[40,420][1040,500]',
            text: wdioFormSwitch ? 'ON' : 'OFF',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-switch-text',
            name: 'Switch Status Label',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/switch_text`,
            accessibilityId: 'switch-text',
            xpath: `//android.widget.TextView[@content-desc="switch-text"]`,
            bounds: '[40,520][1040,570]',
            text: wdioFormSwitch ? 'Click to turn the switch OFF' : 'Click to turn the switch ON',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-dropdown',
            name: 'Dropdown Item Picker',
            type: 'android.widget.Spinner',
            resourceId: `${p}:id/Dropdown`,
            accessibilityId: 'Dropdown',
            xpath: `//android.widget.Spinner[@content-desc="Dropdown"]`,
            bounds: '[40,600][1040,700]',
            text: wdioFormDropdownValue,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-btn-active',
            name: 'Active Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/button_Active`,
            accessibilityId: 'button-Active',
            xpath: `//android.widget.Button[@content-desc="button-Active"]`,
            bounds: '[40,740][520,840]',
            text: 'Active',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-btn-inactive',
            name: 'Inactive Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/button_Inactive`,
            accessibilityId: 'button-Inactive',
            xpath: `//android.widget.Button[@content-desc="button-Inactive"]`,
            bounds: '[560,740][1040,840]',
            text: 'Inactive',
            clickable: true,
            enabled: true
          }
        );
      }

      // Swipe Screen Elements
      if (activeTab === 'swipe') {
        elements.push(
          {
            id: 'elem-wdio-swipe-title',
            name: 'Swipe Horizontal Heading',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_swipe_title`,
            accessibilityId: 'Swipe horizontal',
            xpath: `//android.widget.TextView[@text="Swipe horizontal"]`,
            bounds: '[40,100][800,160]',
            text: 'Swipe horizontal',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-swipe-card',
            name: `Carousel Card: ${wdioSwipeCards[wdioSwipeCardIndex]?.title || 'Card'}`,
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card`,
            accessibilityId: 'card',
            xpath: `//android.view.ViewGroup[@content-desc="card"]`,
            bounds: '[60,200][1020,700]',
            text: wdioSwipeCards[wdioSwipeCardIndex]?.title || 'Card',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-wdio-swipe-secret-logo',
            name: 'Hidden Secret WebdriverIO Logo',
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/secret_logo`,
            accessibilityId: 'WebdriverIO logo',
            xpath: `//android.widget.ImageView[@content-desc="WebdriverIO logo"]`,
            bounds: '[400,760][680,940]',
            text: 'WebdriverIO logo',
            clickable: true,
            enabled: true
          }
        );
      }

      // Drag Screen Elements
      if (activeTab === 'drag') {
        elements.push(
          {
            id: 'elem-wdio-drag-title',
            name: 'Drag and Drop Heading',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_drag_title`,
            accessibilityId: 'Drag and Drop',
            xpath: `//android.widget.TextView[@text="Drag and Drop"]`,
            bounds: '[40,100][600,160]',
            text: 'Drag and Drop',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-wdio-drag-renew',
            name: 'Renew Puzzle Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_renew`,
            accessibilityId: 'button-renew',
            xpath: `//android.widget.Button[@content-desc="button-renew"]`,
            bounds: '[800,90][1040,160]',
            text: 'Renew',
            clickable: true,
            enabled: true
          }
        );

        for (let i = 0; i < 9; i++) {
          elements.push({
            id: `elem-wdio-drag-piece-${i}`,
            name: `Puzzle Piece ${i + 1}`,
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/drag_piece_${i}`,
            accessibilityId: `drag-c${(i % 3) + 1}`,
            xpath: `//android.widget.ImageView[@content-desc="drag-c${(i % 3) + 1}"]`,
            bounds: `[${(i % 3) * 320},${600 + Math.floor(i / 3) * 120}][${((i % 3) + 1) * 320},${700 + Math.floor(i / 3) * 120}]`,
            text: `Piece ${i + 1}`,
            clickable: true,
            enabled: true
          });
        }
      }
    } else if (appMeta.archetype === 'health_insurance') {
      // HEALTH INSURANCE & NIVA CARE NATIVE ELEMENT HIERARCHY
      // Bottom Navigation Tabs
      elements.push(
        {
          id: 'elem-niva-tab-dashboard',
          name: 'Policy Hub Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_policy_hub`,
          accessibilityId: 'Policy Hub',
          xpath: `//android.widget.Button[@content-desc="Policy Hub" or @resource-id="${p}:id/tab_policy_hub"]`,
          bounds: '[0,1800][216,1920]',
          text: 'Policy Hub',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-niva-tab-claims',
          name: 'Cashless Claims Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_cashless_claims`,
          accessibilityId: 'Cashless Claims',
          xpath: `//android.widget.Button[@content-desc="Cashless Claims" or @resource-id="${p}:id/tab_cashless_claims"]`,
          bounds: '[216,1800][432,1920]',
          text: 'Claims',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-niva-tab-hospitals',
          name: 'Network Hospitals Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_network_hospitals`,
          accessibilityId: 'Network Hospitals',
          xpath: `//android.widget.Button[@content-desc="Network Hospitals" or @resource-id="${p}:id/tab_network_hospitals"]`,
          bounds: '[432,1800][648,1920]',
          text: 'Hospitals',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-niva-tab-vitals',
          name: 'Health Score Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_health_score`,
          accessibilityId: 'Health Score',
          xpath: `//android.widget.Button[@content-desc="Health Score" or @resource-id="${p}:id/tab_health_score"]`,
          bounds: '[648,1800][864,1920]',
          text: 'Health',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-niva-tab-card',
          name: 'Health Card Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_health_card`,
          accessibilityId: 'Health Card',
          xpath: `//android.widget.Button[@content-desc="Health Card" or @resource-id="${p}:id/tab_health_card"]`,
          bounds: '[864,1800][1080,1920]',
          text: 'Card',
          clickable: true,
          enabled: true
        }
      );

      // 1. Policy Hub Screen Elements
      if (activeTab === 'dashboard' || !activeTab) {
        elements.push(
          {
            id: 'elem-niva-hero-policy-card',
            name: 'Active Policy Card (ReAssure 2.0 Titanium - ₹10L)',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_active_policy`,
            accessibilityId: 'active_policy_card',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_active_policy"]`,
            bounds: '[40,140][1040,380]',
            text: 'Niva Bupa ReAssure 2.0 • Active Cover ₹10,00,000',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-claim-status-badge',
            name: 'Pre-Auth Claim Status (Max Hospital - Approved)',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_claim_status`,
            accessibilityId: 'claim_status_badge',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/txt_claim_status"]`,
            bounds: '[40,400][1040,480]',
            text: 'Pre-Auth Approved (₹45,000)',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-intimate-claim',
            name: 'Quick Action: File Cashless Claim in 30 Mins',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_file_cashless_claim`,
            accessibilityId: 'File Cashless Claim',
            xpath: `//android.widget.Button[@content-desc="File Cashless Claim" or @resource-id="${p}:id/btn_file_cashless_claim"]`,
            bounds: '[40,500][520,620]',
            text: 'File Cashless Claim',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-find-hospitals',
            name: 'Quick Action: Find 10,400+ Network Hospitals',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_find_network_hospitals`,
            accessibilityId: 'Find Hospitals',
            xpath: `//android.widget.Button[@content-desc="Find Hospitals" or @resource-id="${p}:id/btn_find_network_hospitals"]`,
            bounds: '[560,500][1040,620]',
            text: 'Find Hospitals',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-teleconsult',
            name: 'Quick Action: Book 24x7 Doctor Consultation',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_teleconsult_doctor`,
            accessibilityId: 'Doctor Teleconsultation',
            xpath: `//android.widget.Button[@content-desc="Doctor Teleconsultation" or @resource-id="${p}:id/btn_teleconsult_doctor"]`,
            bounds: '[40,640][520,760]',
            text: 'Doctor Consultation',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-renew-policy',
            name: 'Quick Action: Renew Policy & Pay Premium',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_renew_policy`,
            accessibilityId: 'Renew Policy',
            xpath: `//android.widget.Button[@content-desc="Renew Policy" or @resource-id="${p}:id/btn_renew_policy"]`,
            bounds: '[560,640][1040,760]',
            text: 'Renew Policy',
            clickable: true,
            enabled: true
          }
        );
      }

      // 2. Cashless Claims Intimation Screen
      if (activeTab === 'claims') {
        elements.push(
          {
            id: 'elem-niva-input-policy-no',
            name: 'Policy Number Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_policy_number`,
            accessibilityId: 'Policy Number Input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_policy_number"]`,
            bounds: '[40,160][1040,240]',
            text: nivaClaimPolicyNo,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-input-hospital',
            name: 'Hospital Name Search Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_claim_hospital`,
            accessibilityId: 'Hospital Name Input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_claim_hospital"]`,
            bounds: '[40,260][1040,340]',
            text: nivaClaimHospital,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-input-claim-amount',
            name: 'Estimated Claim Amount Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_claim_amount`,
            accessibilityId: 'Claim Amount Input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_claim_amount"]`,
            bounds: '[40,360][1040,440]',
            text: nivaClaimAmount,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-input-diagnosis',
            name: 'Diagnosis / Ailment Reason Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_diagnosis_reason`,
            accessibilityId: 'Diagnosis Input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_diagnosis_reason"]`,
            bounds: '[40,460][1040,540]',
            text: nivaClaimDiagnosis,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-claim-cashless',
            name: 'Claim Mode Option: Cashless Pre-Auth',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/radio_mode_cashless`,
            accessibilityId: 'Cashless Mode',
            xpath: `//android.widget.RadioButton[@resource-id="${p}:id/radio_mode_cashless"]`,
            bounds: '[40,560][500,620]',
            text: 'Cashless Pre-Auth',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-submit-claim',
            name: 'Submit Cashless Intimation Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_submit_claim_intimation`,
            accessibilityId: 'Submit Claim Intimation',
            xpath: `//android.widget.Button[@content-desc="Submit Claim Intimation" or @resource-id="${p}:id/btn_submit_claim_intimation"]`,
            bounds: '[40,660][1040,750]',
            text: 'Submit Cashless Intimation (30 Min SLA)',
            clickable: true,
            enabled: true
          }
        );
      }

      // 3. Network Hospitals Screen
      if (activeTab === 'hospitals') {
        elements.push(
          {
            id: 'elem-niva-search-hospitals-input',
            name: 'Search Hospitals by City / Pincode Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_search_hospital`,
            accessibilityId: 'Search Hospitals Input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_search_hospital"]`,
            bounds: '[40,140][1040,220]',
            text: nivaSearchHospital || 'Search city or pincode...',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-filter-cashless-toggle',
            name: 'Filter: Cashless Network Only Toggle',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_cashless_only`,
            accessibilityId: 'Cashless Network Only',
            xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_cashless_only"]`,
            bounds: '[40,240][500,300]',
            text: 'Cashless Desk Active',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-hospital-max',
            name: 'Hospital Card: Max Super Speciality Saket',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_hospital_max`,
            accessibilityId: 'Max Super Speciality Saket',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_hospital_max"]`,
            bounds: '[40,320][1040,460]',
            text: 'Max Super Speciality (1.2 km • 4.9★ • Cashless Active)',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-hospital-fortis',
            name: 'Hospital Card: Fortis Escorts Heart Institute',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_hospital_fortis`,
            accessibilityId: 'Fortis Escorts Heart Institute',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_hospital_fortis"]`,
            bounds: '[40,480][1040,620]',
            text: 'Fortis Escorts Heart (3.4 km • 4.8★ • Cashless Active)',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-hospital-apollo',
            name: 'Hospital Card: Apollo Multi-Speciality Indraprastha',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_hospital_apollo`,
            accessibilityId: 'Apollo Multi-Speciality',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_hospital_apollo"]`,
            bounds: '[40,640][1040,780]',
            text: 'Apollo Multi-Speciality (5.1 km • 4.7★ • Cashless Active)',
            clickable: true,
            enabled: true
          }
        );
      }

      // 4. Health Score & Vitals Screen
      if (activeTab === 'vitals') {
        elements.push(
          {
            id: 'elem-niva-steps-counter',
            name: 'Daily Step Activity Counter (6,840 / 10,000)',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_step_tracker`,
            accessibilityId: 'step_tracker',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_step_tracker"]`,
            bounds: '[40,140][1040,320]',
            text: `${nivaStepCount} Steps Walked (68% Goal)`,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-vitals-bp',
            name: 'Blood Pressure Vital Card (120/80 mmHg - Optimal)',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_vital_bp`,
            accessibilityId: 'vital_bp',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_vital_bp"]`,
            bounds: '[40,340][520,460]',
            text: 'BP 120/80 mmHg (Optimal)',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-vitals-pulse',
            name: 'Resting Heart Rate Vital Card (72 bpm - Normal)',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_vital_pulse`,
            accessibilityId: 'vital_pulse',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_vital_pulse"]`,
            bounds: '[560,340][1040,460]',
            text: 'Heart Rate 72 bpm',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-sync-fitbit',
            name: 'Sync Google Fit / Health Connect Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_sync_health_device`,
            accessibilityId: 'Sync Health Device',
            xpath: `//android.widget.Button[@content-desc="Sync Health Device"]`,
            bounds: '[40,480][1040,560]',
            text: 'Sync Vitals & Walk to Earn Discount',
            clickable: true,
            enabled: true
          }
        );
      }

      // 5. Digital Health Card Screen
      if (activeTab === 'card') {
        elements.push(
          {
            id: 'elem-niva-digital-card-view',
            name: 'Niva Bupa Digital Health e-Card',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/card_digital_health_card`,
            accessibilityId: 'digital_health_card',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_digital_health_card"]`,
            bounds: '[40,140][1040,540]',
            text: 'Niva Bupa Health e-Card • Policy NIVA-8849204-IND',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-niva-btn-call-emergency',
            name: '24x7 Cashless Emergency Helpline (1800-200-1111)',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_call_emergency_helpline`,
            accessibilityId: 'Emergency Helpline',
            xpath: `//android.widget.Button[@content-desc="Emergency Helpline" or @resource-id="${p}:id/btn_call_emergency_helpline"]`,
            bounds: '[40,560][1040,650]',
            text: 'Call Emergency Helpline (1800-200-1111)',
            clickable: true,
            enabled: true
          }
        );
      }
    } else if (appMeta.archetype === 'machaxi') {
      // MACHAXI SPORTS & VENUES ELEMENT HIERARCHY
      elements.push(
        {
          id: 'elem-machaxi-tab-home',
          name: 'Arenas & Courts Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_arenas`,
          accessibilityId: 'Arenas',
          xpath: `//android.widget.Button[@content-desc="Arenas"]`,
          bounds: '[0,1800][270,1920]',
          text: 'Arenas',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-tab-booking',
          name: 'Book Slot Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_booking`,
          accessibilityId: 'Booking',
          xpath: `//android.widget.Button[@content-desc="Booking"]`,
          bounds: '[270,1800][540,1920]',
          text: 'Booking',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-tab-login',
          name: 'Member Login Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_login`,
          accessibilityId: 'Sign In',
          xpath: `//android.widget.Button[@content-desc="Sign In"]`,
          bounds: '[540,1800][810,1920]',
          text: 'Sign In',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-tab-settings',
          name: 'Profile & Passes Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_settings`,
          accessibilityId: 'Profile',
          xpath: `//android.widget.Button[@content-desc="Profile"]`,
          bounds: '[810,1800][1080,1920]',
          text: 'Profile',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-btn-badminton',
          name: 'Sport Filter: Badminton Courts (BWF Synthetic)',
          type: 'android.widget.Button',
          resourceId: `${p}:id/chip_sport_badminton`,
          accessibilityId: 'Badminton',
          xpath: `//android.widget.Button[@content-desc="Badminton"]`,
          bounds: '[40,140][280,210]',
          text: 'Badminton',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-btn-pickleball',
          name: 'Sport Filter: Pickleball Arenas',
          type: 'android.widget.Button',
          resourceId: `${p}:id/chip_sport_pickleball`,
          accessibilityId: 'Pickleball',
          xpath: `//android.widget.Button[@content-desc="Pickleball"]`,
          bounds: '[300,140][540,210]',
          text: 'Pickleball',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-machaxi-btn-book-court',
          name: 'Book Slot Action Button (₹450/hr)',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_book_court_slot`,
          accessibilityId: 'Book Court Slot',
          xpath: `//android.widget.Button[@content-desc="Book Court Slot" or @resource-id="${p}:id/btn_book_court_slot"]`,
          bounds: '[40,700][1040,790]',
          text: 'Book Slot (₹450/hr)',
          clickable: true,
          enabled: true
        }
      );
    } else if (appMeta.archetype === 'education') {
      // MILES EDUCATION / MILES ONE HIGHER EDUCATION ELEMENT HIERARCHY
      elements.push(
        {
          id: 'elem-edu-tab-home',
          name: 'Home Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_home`,
          accessibilityId: 'Home',
          xpath: `//android.widget.Button[@content-desc="Home"]`,
          bounds: '[0,1800][216,1920]',
          text: 'Home',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-tab-caira',
          name: 'CAIRA (AI) Assistant Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_caira`,
          accessibilityId: 'CAIRA (AI)',
          xpath: `//android.widget.Button[@content-desc="CAIRA (AI)"]`,
          bounds: '[216,1800][432,1920]',
          text: 'CAIRA (AI)',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-tab-programs',
          name: 'Programs & Certifications Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_programs`,
          accessibilityId: 'Programs',
          xpath: `//android.widget.Button[@content-desc="Programs"]`,
          bounds: '[432,1800][648,1920]',
          text: 'Programs',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-tab-webinars',
          name: 'Webinars & Video Masterclass Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_webinars`,
          accessibilityId: 'Webinars',
          xpath: `//android.widget.Button[@content-desc="Webinars"]`,
          bounds: '[648,1800][864,1920]',
          text: 'Webinars',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-tab-refer',
          name: 'Refer & Earn (₹10,000) Tab Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/tab_refer`,
          accessibilityId: 'Refer & Earn',
          xpath: `//android.widget.Button[@content-desc="Refer & Earn"]`,
          bounds: '[864,1800][1080,1920]',
          text: 'Refer & Earn',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-search-bar',
          name: 'Search Courses & Study Material Input',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/search_courses_input`,
          accessibilityId: 'Search Courses',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/search_courses_input"]`,
          bounds: '[40,140][1040,210]',
          text: eduSearchQuery || 'Search CPA, CMA, US Pathway, ACCA...',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-varun-masterclass',
          name: 'Hero Banner: Varun Jain Video Masterclass',
          type: 'android.view.ViewGroup',
          resourceId: `${p}:id/banner_varun_masterclass`,
          accessibilityId: 'Varun Jain CPA Masterclass',
          xpath: `//android.view.ViewGroup[@resource-id="${p}:id/banner_varun_masterclass"]`,
          bounds: '[40,220][1040,400]',
          text: 'Masterclass with Varun Jain (Lead CPA Faculty)',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-take-caira-test',
          name: 'Action: Take CAIRA AI Readiness Assessment Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_take_caira_assessment`,
          accessibilityId: 'Take CAIRA Assessment',
          xpath: `//android.widget.Button[@content-desc="Take CAIRA Assessment" or @resource-id="${p}:id/btn_take_caira_assessment"]`,
          bounds: '[40,420][1040,490]',
          text: 'Take CAIRA AI Assessment',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-cpa-course',
          name: 'Course Card: US CPA Master Program (AICPA / Becker)',
          type: 'android.view.ViewGroup',
          resourceId: `${p}:id/card_cpa_course`,
          accessibilityId: 'US CPA Master Program',
          xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_cpa_course"]`,
          bounds: '[40,510][1040,700]',
          text: 'US CPA Master Program • AICPA Certified • ₹1,25,000',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-cma-course',
          name: 'Course Card: US CMA Global Certification (IMA Approved)',
          type: 'android.view.ViewGroup',
          resourceId: `${p}:id/card_cma_course`,
          accessibilityId: 'US CMA Global Certification',
          xpath: `//android.view.ViewGroup[@resource-id="${p}:id/card_cma_course"]`,
          bounds: '[40,720][1040,910]',
          text: 'US CMA Global Certification • IMA Approved • ₹95,000',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-enroll-primary',
          name: 'Primary Action: Enroll & Start Learning Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_enroll_course`,
          accessibilityId: 'Enroll & Start Learning',
          xpath: `//android.widget.Button[@content-desc="Enroll & Start Learning" or @resource-id="${p}:id/btn_enroll_course"]`,
          bounds: '[40,930][1040,1010]',
          text: 'Enroll & Start Learning',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-book-counselling',
          name: 'Action: Book 1-on-1 Free Career Counselling Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_book_counselling`,
          accessibilityId: 'Book Free Counselling',
          xpath: `//android.widget.Button[@resource-id="${p}:id/btn_book_counselling"]`,
          bounds: '[40,1030][1040,1110]',
          text: 'Book Free 1-on-1 Career Counselling',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-play-lecture',
          name: 'Video Lecture Play/Pause Media Button',
          type: 'android.widget.ImageButton',
          resourceId: `${p}:id/btn_play_lecture`,
          accessibilityId: 'Play Lecture',
          xpath: `//android.widget.ImageButton[@resource-id="${p}:id/btn_play_lecture"]`,
          bounds: '[480,380][600,500]',
          text: eduIsVideoPlaying ? 'Pause Lecture' : 'Play Lecture',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-submit-mock',
          name: 'Submit Mock Exam Answer Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_submit_mock_answer`,
          accessibilityId: 'Submit Mock Answer',
          xpath: `//android.widget.Button[@content-desc="Submit Mock Answer" or @resource-id="${p}:id/btn_submit_mock_answer"]`,
          bounds: '[40,820][1040,900]',
          text: 'Submit Answer & Validate',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-copy-referral',
          name: 'Action: Copy Referral Code Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_copy_referral_code`,
          accessibilityId: 'Copy Referral Code',
          xpath: `//android.widget.Button[@resource-id="${p}:id/btn_copy_referral_code"]`,
          bounds: '[40,550][520,630]',
          text: 'Copy Code (MILES-VARUN-CPA)',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-edu-btn-share-whatsapp',
          name: 'Action: Share on WhatsApp Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_share_whatsapp`,
          accessibilityId: 'Share on WhatsApp',
          xpath: `//android.widget.Button[@resource-id="${p}:id/btn_share_whatsapp"]`,
          bounds: '[540,550][1040,630]',
          text: 'Share via WhatsApp',
          clickable: true,
          enabled: true
        }
      );
    } else if (appMeta.archetype === 'qalculate') {
      // QALculate Pro Android Calculator Element Hierarchy
      if (activeTab === 'standard' || activeTab === 'scientific') {
        elements.push(
          {
            id: 'elem-calc-formula',
            name: 'Calculation Formula Display',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_formula`,
            accessibilityId: 'calculation formula',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/txt_formula"]`,
            bounds: '[40,160][1040,260]',
            text: calcDisplay,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-result',
            name: 'Calculated Result Output',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/txt_result`,
            accessibilityId: 'calculation result',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/txt_result"]`,
            bounds: '[40,270][1040,390]',
            text: calcResult,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-deg-rad',
            name: 'Angle Mode (DEG/RAD) Switch',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_deg_rad`,
            accessibilityId: 'angle unit',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_deg_rad"]`,
            bounds: '[40,400][190,460]',
            text: calcRadMode ? 'RAD' : 'DEG',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-inv',
            name: 'Inverse Functions Toggle',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_inv`,
            accessibilityId: 'inverse functions',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_inv"]`,
            bounds: '[210,400][360,460]',
            text: 'INV',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-mc',
            name: 'Memory Clear (MC)',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_mc`,
            accessibilityId: 'memory clear',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_mc"]`,
            bounds: '[380,400][530,460]',
            text: 'MC',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-mr',
            name: 'Memory Recall (MR)',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_mr`,
            accessibilityId: 'memory recall',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_mr"]`,
            bounds: '[550,400][700,460]',
            text: 'MR',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-m-plus',
            name: 'Memory Add (M+)',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_m_plus`,
            accessibilityId: 'memory add',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_m_plus"]`,
            bounds: '[720,400][870,460]',
            text: 'M+',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-m-minus',
            name: 'Memory Subtract (M-)',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_m_minus`,
            accessibilityId: 'memory subtract',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_m_minus"]`,
            bounds: '[890,400][1040,460]',
            text: 'M-',
            clickable: true,
            enabled: true
          }
        );

        if (activeTab === 'scientific') {
          elements.push(
            {
              id: 'elem-calc-btn-sin',
              name: 'Sine (sin) Trigonometric Function',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_sin`,
              accessibilityId: 'sine',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_sin"]`,
              bounds: '[40,480][260,560]',
              text: calcInvMode ? 'sin⁻¹' : 'sin',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-cos',
              name: 'Cosine (cos) Trigonometric Function',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_cos`,
              accessibilityId: 'cosine',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_cos"]`,
              bounds: '[300,480][520,560]',
              text: calcInvMode ? 'cos⁻¹' : 'cos',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-tan',
              name: 'Tangent (tan) Trigonometric Function',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_tan`,
              accessibilityId: 'tangent',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_tan"]`,
              bounds: '[560,480][780,560]',
              text: calcInvMode ? 'tan⁻¹' : 'tan',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-ln',
              name: 'Natural Logarithm (ln)',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_ln`,
              accessibilityId: 'natural logarithm',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_ln"]`,
              bounds: '[820,480][1040,560]',
              text: 'ln',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-log',
              name: 'Logarithm Base 10 (log)',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_log`,
              accessibilityId: 'logarithm',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_log"]`,
              bounds: '[40,580][260,660]',
              text: 'log',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-sqrt',
              name: 'Square Root (√) Operator',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_sqrt`,
              accessibilityId: 'square root',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_sqrt"]`,
              bounds: '[300,580][520,660]',
              text: '√',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-power',
              name: 'Power Exponent (xʸ)',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_power`,
              accessibilityId: 'power exponent',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_power"]`,
              bounds: '[560,580][780,660]',
              text: 'xʸ',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-pi',
              name: 'Pi (π) Constant',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_pi`,
              accessibilityId: 'pi constant',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_pi"]`,
              bounds: '[820,580][1040,660]',
              text: 'π',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-e',
              name: 'Euler Number (e) Constant',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_e`,
              accessibilityId: 'euler number',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_e"]`,
              bounds: '[40,680][260,760]',
              text: 'e',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-paren-open',
              name: 'Open Parenthesis ( )',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_paren_open`,
              accessibilityId: 'open parenthesis',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_paren_open"]`,
              bounds: '[300,680][520,760]',
              text: '(',
              clickable: true,
              enabled: true
            },
            {
              id: 'elem-calc-btn-paren-close',
              name: 'Close Parenthesis ( )',
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_paren_close`,
              accessibilityId: 'close parenthesis',
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_paren_close"]`,
              bounds: '[560,680][780,760]',
              text: ')',
              clickable: true,
              enabled: true
            }
          );
        }

        // Primary Standard Numeric Keypad Buttons
        elements.push(
          {
            id: 'elem-calc-btn-ac',
            name: 'Clear All (AC) Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_clear`,
            accessibilityId: 'clear all',
            xpath: `//android.widget.Button[@content-desc="clear all" or @resource-id="${p}:id/btn_clear"]`,
            bounds: '[40,800][260,920]',
            text: 'AC',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-del',
            name: 'Backspace (DEL) Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_del`,
            accessibilityId: 'delete backspace',
            xpath: `//android.widget.Button[@content-desc="delete backspace" or @resource-id="${p}:id/btn_del"]`,
            bounds: '[300,800][520,920]',
            text: 'DEL',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-percent',
            name: 'Percentage (%) Operator',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_percent`,
            accessibilityId: 'percentage',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_percent"]`,
            bounds: '[560,800][780,920]',
            text: '%',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-op-div',
            name: 'Division (÷) Operator',
            type: 'android.widget.Button',
            resourceId: `${p}:id/op_div`,
            accessibilityId: 'divide',
            xpath: `//android.widget.Button[@resource-id="${p}:id/op_div"]`,
            bounds: '[820,800][1040,920]',
            text: '÷',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-7',
            name: 'Digit 7 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_7`,
            accessibilityId: '7',
            xpath: `//android.widget.Button[@text="7" or @resource-id="${p}:id/digit_7"]`,
            bounds: '[40,940][260,1060]',
            text: '7',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-8',
            name: 'Digit 8 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_8`,
            accessibilityId: '8',
            xpath: `//android.widget.Button[@text="8" or @resource-id="${p}:id/digit_8"]`,
            bounds: '[300,940][520,1060]',
            text: '8',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-9',
            name: 'Digit 9 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_9`,
            accessibilityId: '9',
            xpath: `//android.widget.Button[@text="9" or @resource-id="${p}:id/digit_9"]`,
            bounds: '[560,940][780,1060]',
            text: '9',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-op-mul',
            name: 'Multiplication (×) Operator',
            type: 'android.widget.Button',
            resourceId: `${p}:id/op_mul`,
            accessibilityId: 'multiply',
            xpath: `//android.widget.Button[@resource-id="${p}:id/op_mul"]`,
            bounds: '[820,940][1040,1060]',
            text: '×',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-4',
            name: 'Digit 4 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_4`,
            accessibilityId: '4',
            xpath: `//android.widget.Button[@text="4" or @resource-id="${p}:id/digit_4"]`,
            bounds: '[40,1080][260,1200]',
            text: '4',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-5',
            name: 'Digit 5 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_5`,
            accessibilityId: '5',
            xpath: `//android.widget.Button[@text="5" or @resource-id="${p}:id/digit_5"]`,
            bounds: '[300,1080][520,1200]',
            text: '5',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-6',
            name: 'Digit 6 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_6`,
            accessibilityId: '6',
            xpath: `//android.widget.Button[@text="6" or @resource-id="${p}:id/digit_6"]`,
            bounds: '[560,1080][780,1200]',
            text: '6',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-op-sub',
            name: 'Subtraction (-) Operator',
            type: 'android.widget.Button',
            resourceId: `${p}:id/op_sub`,
            accessibilityId: 'minus',
            xpath: `//android.widget.Button[@resource-id="${p}:id/op_sub"]`,
            bounds: '[820,1080][1040,1200]',
            text: '-',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-1',
            name: 'Digit 1 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_1`,
            accessibilityId: '1',
            xpath: `//android.widget.Button[@text="1" or @resource-id="${p}:id/digit_1"]`,
            bounds: '[40,1220][260,1340]',
            text: '1',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-2',
            name: 'Digit 2 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_2`,
            accessibilityId: '2',
            xpath: `//android.widget.Button[@text="2" or @resource-id="${p}:id/digit_2"]`,
            bounds: '[300,1220][520,1340]',
            text: '2',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-3',
            name: 'Digit 3 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_3`,
            accessibilityId: '3',
            xpath: `//android.widget.Button[@text="3" or @resource-id="${p}:id/digit_3"]`,
            bounds: '[560,1220][780,1340]',
            text: '3',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-op-add',
            name: 'Addition (+) Operator',
            type: 'android.widget.Button',
            resourceId: `${p}:id/op_add`,
            accessibilityId: 'plus',
            xpath: `//android.widget.Button[@resource-id="${p}:id/op_add"]`,
            bounds: '[820,1220][1040,1340]',
            text: '+',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-digit-0',
            name: 'Digit 0 Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/digit_0`,
            accessibilityId: '0',
            xpath: `//android.widget.Button[@text="0" or @resource-id="${p}:id/digit_0"]`,
            bounds: '[40,1360][260,1480]',
            text: '0',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-dot',
            name: 'Decimal Point (.) Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_dot`,
            accessibilityId: 'dot',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_dot"]`,
            bounds: '[300,1360][520,1480]',
            text: '.',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-plus-minus',
            name: 'Sign Toggle (±) Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_plus_minus`,
            accessibilityId: 'plus minus',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_plus_minus"]`,
            bounds: '[560,1360][780,1480]',
            text: '±',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-equals',
            name: 'Equals (=) Action Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_equals`,
            accessibilityId: 'equals',
            xpath: `//android.widget.Button[@content-desc="equals" or @resource-id="${p}:id/btn_equals"]`,
            bounds: '[820,1360][1040,1480]',
            text: '=',
            clickable: true,
            enabled: true
          }
        );
      } else if (activeTab === 'converter') {
        elements.push(
          {
            id: 'elem-calc-tab-currency',
            name: 'Currency Mode Tab',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/cat_currency`,
            accessibilityId: 'currency converter',
            xpath: `//android.widget.RadioButton[@resource-id="${p}:id/cat_currency"]`,
            bounds: '[40,160][280,240]',
            text: 'CURRENCY',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-tab-length',
            name: 'Length Mode Tab',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/cat_length`,
            accessibilityId: 'length converter',
            xpath: `//android.widget.RadioButton[@resource-id="${p}:id/cat_length"]`,
            bounds: '[290,160][530,240]',
            text: 'LENGTH',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-convert-input',
            name: 'Conversion From Input Value',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/convert_input`,
            accessibilityId: 'conversion input',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/convert_input"]`,
            bounds: '[40,260][1040,360]',
            text: calcConvertInput,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-btn-swap',
            name: 'Swap Conversion Units',
            type: 'android.widget.ImageButton',
            resourceId: `${p}:id/btn_swap_units`,
            accessibilityId: 'swap units',
            xpath: `//android.widget.ImageButton[@resource-id="${p}:id/btn_swap_units"]`,
            bounds: '[480,380][600,480]',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-calc-convert-result',
            name: 'Converted Result Value',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/convert_result`,
            accessibilityId: 'conversion result',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/convert_result"]`,
            bounds: '[40,500][1040,600]',
            text: calcConvertedResult,
            clickable: true,
            enabled: true
          }
        );
      } else if (activeTab === 'history') {
        elements.push(
          {
            id: 'elem-calc-btn-clear-history',
            name: 'Clear History Log Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_clear_history`,
            accessibilityId: 'clear history',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_clear_history"]`,
            bounds: '[800,160][1040,240]',
            text: 'Clear All',
            clickable: true,
            enabled: true
          }
        );
        calcHistoryList.forEach((hist, idx) => {
          elements.push({
            id: `elem-calc-hist-item-${idx}`,
            name: `History Item ${idx + 1}: ${hist.expression} = ${hist.result}`,
            type: 'android.widget.LinearLayout',
            resourceId: `${p}:id/history_item_${idx}`,
            accessibilityId: `history item ${idx + 1}`,
            xpath: `//android.widget.LinearLayout[@resource-id="${p}:id/history_item_${idx}"]`,
            bounds: `[40,${260 + idx * 120}][1040,${360 + idx * 120}]`,
            text: `${hist.expression} = ${hist.result}`,
            clickable: true,
            enabled: true
          });
        });
      }
    } else if (appMeta.archetype === 'whatsapp') {
      if (inChatRoom) {
        elements.push(
          {
            id: 'elem-header-chat-name',
            name: 'Chat Partner: Alex Lead',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/conversation_contact_name`,
            accessibilityId: 'conversation_contact_name',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/conversation_contact_name"]`,
            bounds: '[140,80][600,140]',
            text: 'QA Team Lead (Alex)',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-input-chat-message',
            name: 'Chat Message Input Field',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/entry_edit_text`,
            accessibilityId: 'entry_edit_text',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/entry_edit_text"]`,
            bounds: '[30,1980][880,2080]',
            text: chatInputText,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-btn-send-message',
            name: 'Send Message Button',
            type: 'android.widget.ImageButton',
            resourceId: `${p}:id/btn_send_message`,
            accessibilityId: 'btn_send_message',
            xpath: `//android.widget.ImageButton[@resource-id="${p}:id/btn_send_message"]`,
            bounds: '[900,1980][1020,2080]',
            clickable: true,
            enabled: true
          }
        );
      } else {
        elements.push(
          {
            id: 'elem-header-whatsapp',
            name: 'WhatsApp App Title',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/home_title`,
            accessibilityId: 'home_title',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/home_title"]`,
            bounds: '[40,80][400,140]',
            text: 'WhatsApp Business',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-row-chat-1',
            name: 'Chat Thread: QA Team Lead',
            type: 'android.widget.RelativeLayout',
            resourceId: `${p}:id/conversations_row_contact_1`,
            accessibilityId: 'conversations_row_contact_1',
            xpath: `//android.widget.RelativeLayout[@resource-id="${p}:id/conversations_row_contact_1"]`,
            bounds: '[0,260][1080,420]',
            text: 'QA Team Lead (Alex)',
            clickable: true,
            enabled: true
          }
        );
      }
    } else if (appMeta.archetype === 'chrome') {
      elements.push(
        {
          id: 'elem-chrome-url-bar',
          name: 'Chrome Omnibox URL Bar',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/url_bar`,
          accessibilityId: 'url_bar',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/url_bar"]`,
          bounds: '[100,70][880,150]',
          text: chromeUrl,
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-google-search-input',
          name: 'Google Web Search Input',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/web_search_box`,
          accessibilityId: 'web_search_box',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/web_search_box"]`,
          bounds: '[60,450][1020,550]',
          text: chromeSearchQuery,
          clickable: true,
          enabled: true
        }
      );
    } else if (appMeta.archetype === 'settings') {
      elements.push(
        {
          id: 'elem-settings-search-bar',
          name: 'Search Settings Action Bar',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/search_action_bar`,
          accessibilityId: 'search_action_bar',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/search_action_bar"]`,
          bounds: '[40,80][1040,170]',
          text: 'Search settings...',
          clickable: true,
          enabled: true
        }
      );
    } else if (appMeta.archetype === 'sound_recorder') {
      // ================= SOUND RECORDER (DANIEL KIM) UI AUTOMATOR ELEMENTS =================
      const isRecTab = activeTab === 'record' || !activeTab;

      elements.push(
        {
          id: 'elem-soundrec-toolbar',
          name: 'Sound Recorder Action Bar Toolbar',
          type: 'android.widget.Toolbar',
          resourceId: `${p}:id/toolbar`,
          accessibilityId: 'toolbar',
          xpath: `//android.widget.Toolbar[@resource-id="${p}:id/toolbar"]`,
          bounds: '[0,60][1080,200]',
          text: 'Sound Recorder',
          clickable: false,
          enabled: true
        },
        {
          id: 'elem-soundrec-overflow-menu',
          name: 'Settings Overflow Menu (3 Dots)',
          type: 'android.widget.ImageView',
          resourceId: `${p}:id/action_settings`,
          accessibilityId: 'More options',
          xpath: `//android.widget.ImageView[@content-desc="More options" or @resource-id="${p}:id/action_settings"]`,
          bounds: '[980,80][1060,180]',
          text: 'Settings',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-soundrec-tab-record',
          name: 'RECORD Tab Bar Button',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/tab_record`,
          accessibilityId: 'RECORD',
          xpath: `//android.widget.TextView[@text="RECORD"]`,
          bounds: '[0,200][540,300]',
          text: 'RECORD',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-soundrec-tab-saved',
          name: 'SAVED RECORDINGS Tab Bar Button',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/tab_saved_recordings`,
          accessibilityId: 'SAVED RECORDINGS',
          xpath: `//android.widget.TextView[@text="SAVED RECORDINGS"]`,
          bounds: '[540,200][1080,300]',
          text: 'SAVED RECORDINGS',
          clickable: true,
          enabled: true
        }
      );

      if (isRecTab) {
        elements.push(
          {
            id: 'elem-soundrec-chronometer',
            name: `Recording Timer Chronometer (${formatSoundRecTime(soundRecSeconds)})`,
            type: 'android.widget.Chronometer',
            resourceId: `${p}:id/chronometer`,
            accessibilityId: 'chronometer',
            xpath: `//android.widget.Chronometer[@resource-id="${p}:id/chronometer"]`,
            bounds: '[240,480][840,1080]',
            text: formatSoundRecTime(soundRecSeconds),
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-soundrec-status-text',
            name: `Recording Status Label ("${soundRecIsRecording ? 'Recording..' : 'Tap the button to start recording'}")`,
            type: 'android.widget.TextView',
            resourceId: `${p}:id/recording_status_text`,
            accessibilityId: 'recording_status_text',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/recording_status_text"]`,
            bounds: '[100,1140][980,1240]',
            text: soundRecIsRecording ? 'Recording..' : 'Tap the button to start recording',
            clickable: false,
            enabled: true
          },
          {
            id: 'elem-soundrec-btn-record',
            name: soundRecIsRecording ? 'Stop Recording FAB Button' : 'Start Recording FAB Button',
            type: 'android.widget.FloatingActionButton',
            resourceId: `${p}:id/btnRecord`,
            accessibilityId: soundRecIsRecording ? 'Stop recording' : 'Start recording',
            xpath: `//android.widget.FloatingActionButton[@resource-id="${p}:id/btnRecord" or @content-desc="${soundRecIsRecording ? 'Stop recording' : 'Start recording'}"]`,
            bounds: '[440,1400][640,1600]',
            text: soundRecIsRecording ? 'Stop' : 'Record',
            clickable: true,
            enabled: true
          }
        );
      } else {
        soundRecSavedList.forEach((rec, idx) => {
          const top = 320 + idx * 200;
          elements.push(
            {
              id: `elem-soundrec-item-${rec.id}`,
              name: `Saved Audio File: ${rec.name} (${rec.length})`,
              type: 'android.support.v7.widget.CardView',
              resourceId: `${p}:id/card_view`,
              accessibilityId: rec.name,
              xpath: `//android.support.v7.widget.CardView[${idx + 1}]`,
              bounds: `[40,${top}][1040,${top + 180}]`,
              text: `${rec.name} • ${rec.length}`,
              clickable: true,
              enabled: true
            },
            {
              id: `elem-soundrec-play-${rec.id}`,
              name: `Play / Pause ${rec.name}`,
              type: 'android.widget.ImageView',
              resourceId: `${p}:id/btn_play`,
              accessibilityId: `Play ${rec.name}`,
              xpath: `//android.widget.ImageView[@resource-id="${p}:id/btn_play" and ../../*[@text="${rec.name}"]]`,
              bounds: `[60,${top + 40}][140,${top + 120}]`,
              text: 'Play',
              clickable: true,
              enabled: true
            }
          );
        });
      }
    } else if (appMeta.archetype === 'apidemos') {
      // ================= APIDEMOS (IO.APPIUM.ANDROID.APIS) UI AUTOMATOR ELEMENTS =================
      const currentLevel = apiDemosPath[apiDemosPath.length - 1];
      const isTopLevel = apiDemosPath.length === 1;

      elements.push(
        {
          id: 'elem-apidemos-actionbar',
          name: `Action Bar: ${currentLevel}`,
          type: 'android.widget.TextView',
          resourceId: `android:id/action_bar_title`,
          accessibilityId: currentLevel,
          xpath: `//android.widget.TextView[@resource-id="android:id/action_bar_title" or @text="${currentLevel}"]`,
          bounds: '[120,60][900,180]',
          text: currentLevel,
          clickable: false,
          enabled: true
        }
      );

      if (!isTopLevel) {
        elements.push({
          id: 'elem-apidemos-btn-back',
          name: 'Navigate Up / Back Button',
          type: 'android.widget.ImageButton',
          resourceId: 'android:id/home',
          accessibilityId: 'Navigate up',
          xpath: `//android.widget.ImageButton[@content-desc="Navigate up" or @resource-id="android:id/home"]`,
          bounds: '[20,70][100,170]',
          text: 'Back',
          clickable: true,
          enabled: true
        });
      }

      if (isTopLevel) {
        const categories = [
          'Accessibility', 'Animation', 'App', 'Content', 'Graphics', 
          'Media', 'NFC', 'OS', 'Preference', 'Text', 'Views'
        ];
        categories.forEach((cat, idx) => {
          const top = 180 + idx * 85;
          elements.push({
            id: `elem-apidemos-item-${cat.toLowerCase()}`,
            name: `Menu Item: ${cat}`,
            type: 'android.widget.TextView',
            resourceId: 'android:id/text1',
            accessibilityId: cat,
            xpath: `//android.widget.TextView[@text="${cat}"]`,
            bounds: `[30,${top}][1050,${top + 75}]`,
            text: cat,
            clickable: true,
            enabled: true
          });
        });
      } else if (currentLevel === 'Views') {
        const subViews = [
          'Buttons', 'Controls', 'Date Widgets', 'Lists', 'Radio Group', 
          'Rating Bar', 'Seek Bar', 'Spinner', 'Tabs', 'TextFields', 'Visibility'
        ];
        subViews.forEach((sub, idx) => {
          const top = 180 + idx * 85;
          elements.push({
            id: `elem-apidemos-sub-${sub.toLowerCase().replace(/ /g, '_')}`,
            name: `View Option: ${sub}`,
            type: 'android.widget.TextView',
            resourceId: 'android:id/text1',
            accessibilityId: sub,
            xpath: `//android.widget.TextView[@text="${sub}"]`,
            bounds: `[30,${top}][1050,${top + 75}]`,
            text: sub,
            clickable: true,
            enabled: true
          });
        });
      } else if (currentLevel === 'Controls' || currentLevel === 'Buttons' || currentLevel === 'TextFields') {
        elements.push(
          {
            id: 'elem-apidemos-input-text',
            name: 'Save Text Field (EditText)',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/edit`,
            accessibilityId: 'edit',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/edit"]`,
            bounds: '[40,200][1040,300]',
            text: apiDemosEditText,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-checkbox-1',
            name: 'Checkbox 1 (Checked)',
            type: 'android.widget.CheckBox',
            resourceId: `${p}:id/check1`,
            accessibilityId: 'Checkbox 1',
            xpath: `//android.widget.CheckBox[@resource-id="${p}:id/check1" or @text="Checkbox 1"]`,
            bounds: '[40,320][500,400]',
            text: 'Checkbox 1',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-checkbox-2',
            name: 'Checkbox 2',
            type: 'android.widget.CheckBox',
            resourceId: `${p}:id/check2`,
            accessibilityId: 'Checkbox 2',
            xpath: `//android.widget.CheckBox[@resource-id="${p}:id/check2" or @text="Checkbox 2"]`,
            bounds: '[540,320][1000,400]',
            text: 'Checkbox 2',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-toggle-btn',
            name: `Toggle Button (${apiDemosToggleBtn ? 'ON' : 'OFF'})`,
            type: 'android.widget.ToggleButton',
            resourceId: `${p}:id/toggle_button`,
            accessibilityId: apiDemosToggleBtn ? 'ON' : 'OFF',
            xpath: `//android.widget.ToggleButton[@resource-id="${p}:id/toggle_button"]`,
            bounds: '[40,420][480,520]',
            text: apiDemosToggleBtn ? 'ON' : 'OFF',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-btn-normal',
            name: 'Normal Push Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/button_normal`,
            accessibilityId: 'Normal Button',
            xpath: `//android.widget.Button[@text="Normal Button" or @resource-id="${p}:id/button_normal"]`,
            bounds: '[540,420][1040,520]',
            text: 'Normal Button',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-radio-1',
            name: 'RadioButton 1',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/radio1`,
            accessibilityId: 'RadioButton 1',
            xpath: `//android.widget.RadioButton[@text="RadioButton 1"]`,
            bounds: '[40,540][500,620]',
            text: 'RadioButton 1',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-radio-2',
            name: 'RadioButton 2',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/radio2`,
            accessibilityId: 'RadioButton 2',
            xpath: `//android.widget.RadioButton[@text="RadioButton 2"]`,
            bounds: '[540,540][1000,620]',
            text: 'RadioButton 2',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-rating-bar',
            name: `Interactive RatingBar (${apiDemosRating} / 5 Stars)`,
            type: 'android.widget.RatingBar',
            resourceId: `${p}:id/ratingbar`,
            accessibilityId: 'RatingBar',
            xpath: `//android.widget.RatingBar[@resource-id="${p}:id/ratingbar"]`,
            bounds: '[40,640][600,740]',
            text: `${apiDemosRating}`,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-seek-bar',
            name: `SeekBar Slider (${apiDemosSeekBar}%)`,
            type: 'android.widget.SeekBar',
            resourceId: `${p}:id/seekbar`,
            accessibilityId: 'SeekBar',
            xpath: `//android.widget.SeekBar[@resource-id="${p}:id/seekbar"]`,
            bounds: '[40,760][1040,840]',
            text: `${apiDemosSeekBar}`,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-spinner',
            name: `Planet Spinner Dropdown (${apiDemosSpinner})`,
            type: 'android.widget.Spinner',
            resourceId: `${p}:id/spinner`,
            accessibilityId: 'Spinner',
            xpath: `//android.widget.Spinner[@resource-id="${p}:id/spinner"]`,
            bounds: '[40,860][1040,950]',
            text: apiDemosSpinner,
            clickable: true,
            enabled: true
          }
        );
      } else if (currentLevel === 'App') {
        const appItems = [
          'Activity', 'Alarm', 'Alert Dialogs', 'Device Admin', 
          'Fragment', 'Notification', 'Search', 'Voice Recognition'
        ];
        appItems.forEach((sub, idx) => {
          const top = 180 + idx * 85;
          elements.push({
            id: `elem-apidemos-app-${sub.toLowerCase().replace(/ /g, '_')}`,
            name: `App Feature: ${sub}`,
            type: 'android.widget.TextView',
            resourceId: 'android:id/text1',
            accessibilityId: sub,
            xpath: `//android.widget.TextView[@text="${sub}"]`,
            bounds: `[30,${top}][1050,${top + 75}]`,
            text: sub,
            clickable: true,
            enabled: true
          });
        });
      } else if (currentLevel === 'Alert Dialogs') {
        elements.push(
          {
            id: 'elem-apidemos-btn-dialog-ok-cancel',
            name: 'OK Cancel Dialog with Message Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/two_buttons`,
            accessibilityId: 'OK Cancel Dialog with Message',
            xpath: `//android.widget.Button[@resource-id="${p}:id/two_buttons"]`,
            bounds: '[40,200][1040,300]',
            text: 'OK Cancel Dialog with Message',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-btn-dialog-list',
            name: 'List Dialog Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/select_button`,
            accessibilityId: 'List dialog',
            xpath: `//android.widget.Button[@resource-id="${p}:id/select_button"]`,
            bounds: '[40,320][1040,420]',
            text: 'List dialog',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apidemos-btn-dialog-progress',
            name: 'Progress Dialog Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/progress_button`,
            accessibilityId: 'Progress Bar dialog',
            xpath: `//android.widget.Button[@resource-id="${p}:id/progress_button"]`,
            bounds: '[40,440][1040,540]',
            text: 'Progress Bar dialog',
            clickable: true,
            enabled: true
          }
        );
      } else {
        const defaultItems = ['Overview', 'Sample 1', 'Sample 2', 'Interactive Demo'];
        defaultItems.forEach((sub, idx) => {
          const top = 180 + idx * 85;
          elements.push({
            id: `elem-apidemos-subitem-${idx}`,
            name: `${currentLevel} / ${sub}`,
            type: 'android.widget.TextView',
            resourceId: 'android:id/text1',
            accessibilityId: sub,
            xpath: `//android.widget.TextView[@text="${sub}"]`,
            bounds: `[30,${top}][1050,${top + 75}]`,
            text: sub,
            clickable: true,
            enabled: true
          });
        });
      }
    } else if (appMeta.archetype === 'fdroid') {
      // F-Droid Elements
      elements.push(
        {
          id: 'elem-fdroid-toolbar',
          name: 'F-Droid Toolbar',
          type: 'androidx.appcompat.widget.Toolbar',
          resourceId: `${p}:id/toolbar`,
          accessibilityId: 'F-Droid',
          xpath: `//androidx.appcompat.widget.Toolbar[@resource-id="${p}:id/toolbar"]`,
          bounds: '[0,60][1080,200]',
          text: fdroidSelectedApp ? fdroidSelectedApp.name : 'F-Droid',
          clickable: false,
          enabled: true
        },
        {
          id: 'elem-fdroid-search-input',
          name: 'Search F-Droid Apps',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/search_src_text`,
          accessibilityId: 'Search apps',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/search_src_text"]`,
          bounds: '[30,195][1050,285]',
          text: fdroidSearchQuery || 'Search apps...',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-btn-sync',
          name: 'Sync Repositories Button',
          type: 'android.widget.ImageView',
          resourceId: `${p}:id/menu_sync`,
          accessibilityId: 'Update repositories',
          xpath: `//android.widget.ImageView[@content-desc="Update repositories"]`,
          bounds: '[920,80][980,140]',
          text: 'Sync',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-tab-latest',
          name: 'Latest Tab',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/bottom_nav_latest`,
          accessibilityId: 'Latest',
          xpath: `//android.widget.TextView[@text="Latest"]`,
          bounds: '[0,2000][216,2120]',
          text: 'Latest',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-tab-categories',
          name: 'Categories Tab',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/bottom_nav_categories`,
          accessibilityId: 'Categories',
          xpath: `//android.widget.TextView[@text="Categories"]`,
          bounds: '[216,2000][432,2120]',
          text: 'Categories',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-tab-nearby',
          name: 'Nearby Tab',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/bottom_nav_nearby`,
          accessibilityId: 'Nearby',
          xpath: `//android.widget.TextView[@text="Nearby"]`,
          bounds: '[432,2000][648,2120]',
          text: 'Nearby',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-tab-updates',
          name: 'Updates Tab',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/bottom_nav_updates`,
          accessibilityId: 'Updates',
          xpath: `//android.widget.TextView[@text="Updates"]`,
          bounds: '[648,2000][864,2120]',
          text: 'Updates',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-fdroid-tab-settings',
          name: 'Settings Tab',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/bottom_nav_settings`,
          accessibilityId: 'Settings',
          xpath: `//android.widget.TextView[@text="Settings"]`,
          bounds: '[864,2000][1080,2120]',
          text: 'Settings',
          clickable: true,
          enabled: true
        }
      );

      if (fdroidSelectedApp) {
        elements.push(
          {
            id: 'elem-fdroid-btn-back',
            name: 'Back to App List',
            type: 'android.widget.ImageButton',
            resourceId: `${p}:id/btn_back`,
            accessibilityId: 'Navigate up',
            xpath: `//android.widget.ImageButton[@content-desc="Navigate up"]`,
            bounds: '[30,80][100,150]',
            text: 'Back',
            clickable: true,
            enabled: true
          },
          {
            id: `elem-fdroid-detail-btn-action`,
            name: fdroidInstalledApps[fdroidSelectedApp.id] ? `Open ${fdroidSelectedApp.name}` : `Install ${fdroidSelectedApp.name}`,
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_install`,
            accessibilityId: fdroidInstalledApps[fdroidSelectedApp.id] ? 'Open' : 'Install',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_install"]`,
            bounds: '[750,220][1040,320]',
            text: fdroidInstalledApps[fdroidSelectedApp.id] ? 'OPEN' : 'INSTALL',
            clickable: true,
            enabled: true
          },
          {
            id: `elem-fdroid-detail-desc`,
            name: 'App Description',
            type: 'android.widget.TextView',
            resourceId: `${p}:id/description`,
            accessibilityId: 'Description',
            xpath: `//android.widget.TextView[@resource-id="${p}:id/description"]`,
            bounds: '[40,550][1040,800]',
            text: fdroidSelectedApp.description,
            clickable: false,
            enabled: true
          }
        );
      } else {
        displayedFdroidApps.forEach((app, idx) => {
          const top = 300 + idx * 160;
          elements.push(
            {
              id: `elem-fdroid-card-${app.id}`,
              name: `App Card: ${app.name}`,
              type: 'androidx.cardview.widget.CardView',
              resourceId: `${p}:id/app_card_${app.id.replace(/\./g, '_')}`,
              accessibilityId: app.name,
              xpath: `//androidx.cardview.widget.CardView[@content-desc="${app.name}"]`,
              bounds: `[30,${top}][1050,${top + 140}]`,
              text: app.name,
              clickable: true,
              enabled: true
            },
            {
              id: `elem-fdroid-btn-${app.id}`,
              name: fdroidInstalledApps[app.id] ? `Open ${app.name}` : `Install ${app.name}`,
              type: 'android.widget.Button',
              resourceId: `${p}:id/btn_action_${app.id.replace(/\./g, '_')}`,
              accessibilityId: fdroidInstalledApps[app.id] ? `Open ${app.name}` : `Install ${app.name}`,
              xpath: `//android.widget.Button[@resource-id="${p}:id/btn_action_${app.id.replace(/\./g, '_')}"]`,
              bounds: `[850,${top + 30}][1030,${top + 100}]`,
              text: fdroidInstalledApps[app.id] ? 'OPEN' : 'INSTALL',
              clickable: true,
              enabled: true
            }
          );
        });
      }
    } else if (appMeta.archetype === 'malarm') {
      // Malarm Minimalist Alarm Clock Elements
      elements.push(
        {
          id: 'elem-malarm-header',
          name: 'Malarm Alarm Header',
          type: 'android.widget.TextView',
          resourceId: `${p}:id/header_title`,
          accessibilityId: 'Malarm',
          xpath: `//android.widget.TextView[@resource-id="${p}:id/header_title"]`,
          bounds: '[0,60][1080,180]',
          text: 'Malarm',
          clickable: false,
          enabled: true
        },
        {
          id: 'elem-malarm-digital-clock',
          name: 'Current Time Display',
          type: 'android.widget.TextClock',
          resourceId: `${p}:id/digital_clock`,
          accessibilityId: 'Current Time',
          xpath: `//android.widget.TextClock[@resource-id="${p}:id/digital_clock"]`,
          bounds: '[200,190][880,340]',
          text: '08:26 AM',
          clickable: false,
          enabled: true
        },
        {
          id: 'elem-malarm-fab-add',
          name: 'Add Alarm Floating Action Button',
          type: 'com.google.android.material.floatingactionbutton.FloatingActionButton',
          resourceId: `${p}:id/fab_add`,
          accessibilityId: 'Add Alarm',
          xpath: `//com.google.android.material.floatingactionbutton.FloatingActionButton[@content-desc="Add Alarm"]`,
          bounds: '[440,1920][640,2120]',
          text: '+',
          clickable: true,
          enabled: true
        }
      );

      malarmAlarms.forEach((al, idx) => {
        const top = 360 + idx * 170;
        elements.push(
          {
            id: `elem-malarm-card-${al.id}`,
            name: `Alarm Card ${al.time} ${al.period}`,
            type: 'androidx.cardview.widget.CardView',
            resourceId: `${p}:id/alarm_row_${al.id}`,
            accessibilityId: `Alarm ${al.time} ${al.period}`,
            xpath: `//androidx.cardview.widget.CardView[@content-desc="Alarm ${al.time} ${al.period}"]`,
            bounds: `[30,${top}][1050,${top + 150}]`,
            text: `${al.time} ${al.period} - ${al.label}`,
            clickable: true,
            enabled: true
          },
          {
            id: `elem-malarm-switch-${al.id}`,
            name: `Toggle Switch ${al.time} ${al.period}`,
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_${al.id}`,
            accessibilityId: `Toggle ${al.time}`,
            xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_${al.id}"]`,
            bounds: `[870,${top + 35}][1020,${top + 115}]`,
            text: al.enabled ? 'ON' : 'OFF',
            clickable: true,
            enabled: true
          },
          {
            id: `elem-malarm-delete-${al.id}`,
            name: `Delete Alarm ${al.time}`,
            type: 'android.widget.ImageView',
            resourceId: `${p}:id/delete_${al.id}`,
            accessibilityId: `Delete alarm ${al.time}`,
            xpath: `//android.widget.ImageView[@content-desc="Delete alarm ${al.time}"]`,
            bounds: `[780,${top + 45}][840,${top + 105}]`,
            text: 'Delete',
            clickable: true,
            enabled: true
          }
        );
      });

      if (malarmIsAdding || malarmEditingId) {
        elements.push(
          {
            id: 'elem-malarm-input-hour',
            name: 'Alarm Hour Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/hour_picker`,
            accessibilityId: 'Hour',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/hour_picker"]`,
            bounds: '[320,800][460,940]',
            text: malarmNewHour,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-malarm-input-minute',
            name: 'Alarm Minute Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/minute_picker`,
            accessibilityId: 'Minute',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/minute_picker"]`,
            bounds: '[500,800][640,940]',
            text: malarmNewMinute,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-malarm-toggle-am-pm',
            name: 'AM / PM Selector',
            type: 'android.widget.RadioButton',
            resourceId: `${p}:id/period_picker`,
            accessibilityId: malarmNewPeriod,
            xpath: `//android.widget.RadioButton[@text="${malarmNewPeriod}"]`,
            bounds: '[680,800][780,940]',
            text: malarmNewPeriod,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-malarm-input-label',
            name: 'Alarm Label EditText',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/label_input`,
            accessibilityId: 'Alarm label',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/label_input"]`,
            bounds: '[200,1000][880,1090]',
            text: malarmNewLabel,
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-malarm-btn-save',
            name: 'Save Alarm Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_save`,
            accessibilityId: 'Save Alarm',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_save"]`,
            bounds: '[560,1300][880,1400]',
            text: 'SAVE ALARM',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-malarm-btn-cancel',
            name: 'Cancel Alarm Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_cancel`,
            accessibilityId: 'Cancel',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_cancel"]`,
            bounds: '[200,1300][520,1400]',
            text: 'CANCEL',
            clickable: true,
            enabled: true
          }
        );
      }
    } else {
      // Dynamic Universal Native Android Application Screen
      const apkAssets = getApkAssets(pkg, mobileApkName);
      const appTitle = apkAssets?.appName || appMeta.displayName || 'Android App';
      
      elements.push(
        {
          id: 'elem-apk-toolbar',
          name: `${appTitle} Action Bar Toolbar`,
          type: 'android.widget.Toolbar',
          resourceId: `${p}:id/toolbar`,
          accessibilityId: 'toolbar',
          xpath: `//android.widget.Toolbar[@resource-id="${p}:id/toolbar"]`,
          bounds: '[0,60][1080,200]',
          text: appTitle,
          clickable: false,
          enabled: true
        },
        {
          id: 'elem-apk-search-bar',
          name: `Search in ${appTitle}`,
          type: 'android.widget.EditText',
          resourceId: `${p}:id/search_edit_text`,
          accessibilityId: 'Search',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/search_edit_text"]`,
          bounds: '[40,220][1040,310]',
          text: genericSearch,
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-apk-btn-primary-action',
          name: 'Primary Native Action Button',
          type: 'android.widget.Button',
          resourceId: `${p}:id/btn_action_primary`,
          accessibilityId: 'Action',
          xpath: `//android.widget.Button[@resource-id="${p}:id/btn_action_primary"]`,
          bounds: '[40,330][1040,430]',
          text: 'Execute Feature',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-apk-switch-toggle',
          name: 'Feature Toggle Switch',
          type: 'android.widget.Switch',
          resourceId: `${p}:id/switch_feature`,
          accessibilityId: 'Enable Feature',
          xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_feature"]`,
          bounds: '[40,450][1040,540]',
          text: genericTermsAccepted ? 'ON' : 'OFF',
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-apk-input-name',
          name: 'User Input Text Box',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/edit_text_name`,
          accessibilityId: 'User Name',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/edit_text_name"]`,
          bounds: '[40,560][1040,660]',
          text: genericFormName,
          clickable: true,
          enabled: true
        },
        {
          id: 'elem-apk-input-email',
          name: 'Email Input Text Box',
          type: 'android.widget.EditText',
          resourceId: `${p}:id/edit_text_email`,
          accessibilityId: 'Email Address',
          xpath: `//android.widget.EditText[@resource-id="${p}:id/edit_text_email"]`,
          bounds: '[40,680][1040,780]',
          text: genericFormEmail,
          clickable: true,
          enabled: true
        }
      );

      if (activeTab === 'settings' || activeTab === 'display' || activeTab === 'about' || activeTab === 'profile') {
        elements.push(
          {
            id: 'elem-apk-switch-notifications',
            name: 'Push Notifications Switch',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_notifications`,
            accessibilityId: 'switch_notifications',
            xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_notifications"]`,
            bounds: '[40,160][1040,240]',
            text: 'Push Notifications',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apk-switch-darkmode',
            name: 'Dark Mode Theme Switch',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_dark_mode`,
            accessibilityId: 'switch_dark_mode',
            xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_dark_mode"]`,
            bounds: '[40,260][1040,340]',
            text: 'Dark Mode',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apk-switch-biometrics',
            name: 'Biometric Authentication Switch',
            type: 'android.widget.Switch',
            resourceId: `${p}:id/switch_biometrics`,
            accessibilityId: 'switch_biometrics',
            xpath: `//android.widget.Switch[@resource-id="${p}:id/switch_biometrics"]`,
            bounds: '[40,360][1040,440]',
            text: 'Biometric Auth',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apk-btn-signout',
            name: 'Sign Out / Reset Account Button',
            type: 'android.widget.Button',
            resourceId: `${p}:id/btn_account_signout`,
            accessibilityId: 'btn_account_signout',
            xpath: `//android.widget.Button[@resource-id="${p}:id/btn_account_signout"]`,
            bounds: '[40,480][1040,560]',
            text: 'Sign Out Account',
            clickable: true,
            enabled: true
          }
        );
      } else {
        // Records / History / Other Tabs
        elements.push(
          {
            id: 'elem-apk-records-search',
            name: 'Filter Activity Records Input',
            type: 'android.widget.EditText',
            resourceId: `${p}:id/input_records_filter`,
            accessibilityId: 'input_records_filter',
            xpath: `//android.widget.EditText[@resource-id="${p}:id/input_records_filter"]`,
            bounds: '[40,160][1040,240]',
            text: 'Filter records...',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apk-record-item-1',
            name: 'Activity Record: Session Initialization',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/item_record_1`,
            accessibilityId: 'item_record_1',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/item_record_1"]`,
            bounds: '[40,260][1040,380]',
            text: 'Session Initialized Successfully',
            clickable: true,
            enabled: true
          },
          {
            id: 'elem-apk-record-item-2',
            name: 'Activity Record: Data Synchronized',
            type: 'android.view.ViewGroup',
            resourceId: `${p}:id/item_record_2`,
            accessibilityId: 'item_record_2',
            xpath: `//android.view.ViewGroup[@resource-id="${p}:id/item_record_2"]`,
            bounds: '[40,400][1040,520]',
            text: 'Cloud Synchronized (2.4 MB)',
            clickable: true,
            enabled: true
          }
        );
      }
    }

    return elements;
  }, [appMeta, activeTab, sauceActiveView, sauceCartCount, sauceSearchFilter, displayedProducts, sauceSelectedProduct, sauceProductQuantity, sauceTotal, sauceAddress, saucePayment, sauceLoginUsername, sauceLoginPassword, inChatRoom, chatInputText, chromeUrl, chromeSearchQuery, genericFormName, genericFormEmail, genericSearch, genericCategory, genericSelectedItemId, genericItemQuantity, genericPassword, genericAddress, genericCity, genericPostalCode, genericTermsAccepted, genericNotificationToggle, genericDarkModeToggle, genericBiometricToggle, genericCartCount, calcDisplay, calcResult, calcRadMode, calcInvMode, calcMemory, calcConvertCategory, calcConvertInput, calcConvertFrom, calcConvertTo, calcConvertedResult, calcHistoryList, nivaClaimPolicyNo, nivaClaimHospital, nivaClaimAmount, nivaClaimDiagnosis, nivaClaimType, nivaSearchHospital, nivaStepCount, machaxiSelectedSport, machaxiSelectedVenue, machaxiSelectedSlot, soundRecIsRecording, soundRecSeconds, soundRecSavedList, pkg, mobileApkName]);

  const filteredElements = useMemo(() => {
    if (!hierarchyFilter.trim()) return currentElements;
    const q = hierarchyFilter.toLowerCase();
    return currentElements.filter(e => 
      (e.name && e.name.toLowerCase().includes(q)) || 
      (e.resourceId && e.resourceId.toLowerCase().includes(q)) || 
      (e.type && e.type.toLowerCase().includes(q)) ||
      (e.text && e.text.toLowerCase().includes(q))
    );
  }, [currentElements, hierarchyFilter]);

  const handleCalcButtonClick = (token: string, elemId: string, resourceId: string, event: React.MouseEvent) => {
    const elem: MobileElementInfo = currentElements.find(e => (typeof e.resourceId === 'string' && typeof resourceId === 'string' && e.resourceId.endsWith(resourceId)) || e.id === elemId) || {
      id: elemId,
      name: `Calculator ${token} Button`,
      type: 'android.widget.Button',
      resourceId: `${pkg}:id/${resourceId}`,
      xpath: `//android.widget.Button[@resource-id="${pkg}:id/${resourceId}"]`,
      bounds: '[0,0][0,0]',
      text: token,
      clickable: true,
      enabled: true
    };

    if (token === 'AC') {
      setCalcDisplay('0');
      setCalcResult('0');
    } else if (token === 'DEL') {
      setCalcDisplay(prev => {
        const next = prev.length <= 1 ? '0' : prev.slice(0, -1);
        const res = evaluateCalcMath(next, calcRadMode);
        setCalcResult(res !== 'Error' && res !== '...' ? res : '0');
        return next;
      });
    } else if (token === '=') {
      const finalRes = evaluateCalcMath(calcDisplay, calcRadMode);
      if (finalRes !== 'Error' && finalRes !== '...' && finalRes !== '0') {
        const newHistItem = {
          id: `hist-${Date.now()}`,
          expression: calcDisplay,
          result: finalRes,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setCalcHistoryList(prev => [newHistItem, ...prev.slice(0, 19)]);
        setCalcResult(finalRes);
        setCalcDisplay(finalRes);
        toast.success(`Calculated: ${calcDisplay} = ${finalRes}`);
      } else {
        setCalcResult(finalRes);
      }
    } else if (token === '±') {
      setCalcDisplay(prev => {
        let next = prev;
        if (next.startsWith('-')) {
          next = next.substring(1);
        } else if (next !== '0') {
          next = '-' + next;
        }
        const res = evaluateCalcMath(next, calcRadMode);
        setCalcResult(res !== 'Error' && res !== '...' ? res : '0');
        return next;
      });
    } else if (token === 'RAD_DEG') {
      const nextRad = !calcRadMode;
      setCalcRadMode(nextRad);
      const res = evaluateCalcMath(calcDisplay, nextRad);
      setCalcResult(res !== 'Error' && res !== '...' ? res : '0');
      toast.info(`Angle Mode: ${nextRad ? 'RAD (Radians)' : 'DEG (Degrees)'}`);
    } else if (token === 'INV') {
      setCalcInvMode(!calcInvMode);
    } else if (token === 'MC') {
      setCalcMemory(0);
      toast.info('Memory Cleared (MC: 0)');
    } else if (token === 'MR') {
      setCalcDisplay(prev => (prev === '0' ? String(calcMemory) : prev + String(calcMemory)));
      const res = evaluateCalcMath(calcDisplay + String(calcMemory), calcRadMode);
      setCalcResult(res !== 'Error' && res !== '...' ? res : '0');
      toast.info(`Recalled Memory: ${calcMemory}`);
    } else if (token === 'M+') {
      const num = parseFloat(calcResult) || parseFloat(calcDisplay) || 0;
      setCalcMemory(prev => prev + num);
      toast.success(`M+ Added ${num} (Memory: ${calcMemory + num})`);
    } else if (token === 'M-') {
      const num = parseFloat(calcResult) || parseFloat(calcDisplay) || 0;
      setCalcMemory(prev => prev - num);
      toast.info(`M- Subtracted ${num} (Memory: ${calcMemory - num})`);
    } else {
      // Normal digit or operator or scientific func
      setCalcDisplay(prev => {
        let next = prev;
        if (prev === '0' && !['+', '-', '×', '÷', '%', '^', '.', '00'].includes(token)) {
          next = token;
        } else {
          next = prev + token;
        }
        const res = evaluateCalcMath(next, calcRadMode);
        setCalcResult(res !== 'Error' && res !== '...' ? res : '0');
        return next;
      });
    }

    handleElementClick(elem, event);
  };

  const handleElementClick = (elem: MobileElementInfo, e: React.MouseEvent) => {
    let extraMetrics: { targetBox: { x: number; y: number; width: number; height: number }; coordinates: { x: number; y: number } } | undefined;

    const enrichedElem = {
      ...elem,
      screen: elem.screen || activeTab || 'MAIN'
    };

    const screenEl = phoneScreenRef.current || (e?.currentTarget as HTMLElement)?.closest?.('[data-mobile-screen="true"]');
    if (screenEl && e?.currentTarget) {
      try {
        const screenRect = screenEl.getBoundingClientRect();
        const elemRect = (e.currentTarget as HTMLElement).getBoundingClientRect();

        const rippleX = e.clientX ? e.clientX - screenRect.left : screenRect.width / 2;
        const rippleY = e.clientY ? e.clientY - screenRect.top : screenRect.height / 2;
        triggerTouchRipple(rippleX, rippleY);

        if (screenRect.width > 0 && screenRect.height > 0) {
          const clickXPct = Number(Math.max(0.5, Math.min(99.5, (((e.clientX || elemRect.left + elemRect.width/2) - screenRect.left) / screenRect.width) * 100)).toFixed(1));
          const clickYPct = Number(Math.max(0.5, Math.min(99.5, (((e.clientY || elemRect.top + elemRect.height/2) - screenRect.top) / screenRect.height) * 100)).toFixed(1));

          const elemXPct = Number(Math.max(0, Math.min(98, ((elemRect.left - screenRect.left) / screenRect.width) * 100)).toFixed(1));
          const elemYPct = Number(Math.max(0, Math.min(98, ((elemRect.top - screenRect.top) / screenRect.height) * 100)).toFixed(1));
          const elemWPct = Number(Math.max(2, Math.min(98, (elemRect.width / screenRect.width) * 100)).toFixed(1));
          const elemHPct = Number(Math.max(2, Math.min(98, (elemRect.height / screenRect.height) * 100)).toFixed(1));

          extraMetrics = {
            targetBox: { x: elemXPct, y: elemYPct, width: elemWPct, height: elemHPct },
            coordinates: { x: clickXPct, y: clickYPct }
          };
        }
      } catch (err) {
        console.warn("Bounding rect calculation notice:", err);
      }
    } else if (e?.currentTarget) {
      try {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.round((e.clientX || rect.left + rect.width / 2) - rect.left);
        const y = Math.round((e.clientY || rect.top + rect.height / 2) - rect.top);
        triggerTouchRipple(x, y);
      } catch (err) {}
    }

    setSelectedElement(enrichedElem);
    
    const action = inspectorMode === 'type' ? 'fill' : 
                   inspectorMode === 'assert' ? 'assertion' : 
                   inspectorMode === 'long_press' ? 'long_press' : 'click';
    
    const value = inspectorMode === 'type' ? inspectorInputText : enrichedElem.text;
    onRecordElement(enrichedElem, action, value, e, extraMetrics);
  };

  const handleLiveFrameClick = async (e: React.PointerEvent<HTMLImageElement>) => {
    const image = e.currentTarget;
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || 1080;
    const naturalHeight = image.naturalHeight || 2400;
    const imageScale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const renderedWidth = naturalWidth * imageScale;
    const renderedHeight = naturalHeight * imageScale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const localX = e.clientX - rect.left - offsetX;
    const localY = e.clientY - rect.top - offsetY;

    // Ignore taps in the letterboxed area created by object-contain.
    if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) return;

    const deviceX = Math.round(localX / imageScale);
    const deviceY = Math.round(localY / imageScale);
    triggerTouchRipple(e.clientX - rect.left, e.clientY - rect.top);

    // Record and dispatch the tap synchronously. The live screenshot refreshes
    // several times a second, so waiting for a hierarchy request before calling
    // onRecordElement can cause the browser click to be lost altogether.
    const coordinateElem: MobileElementInfo = {
      id: `coordinate-${deviceX}-${deviceY}-${Date.now()}`,
      name: 'Screen position',
      type: 'android.view.View',
      resourceId: '',
      // A point is not an Android node. Keep XPath empty so the recorder uses
      // the explicit coordinate fallback instead of persisting a fake locator.
      xpath: '',
      bounds: `[${deviceX},${deviceY}][${deviceX},${deviceY}]`,
      screen: activeTab || 'MAIN',
      clickable: true,
      enabled: true
    };
    const action = inspectorMode === 'type' ? 'fill' : inspectorMode === 'assert' ? 'assertion' : inspectorMode === 'long_press' ? 'long_press' : 'click';
    const coordinateMetrics = {
      targetBox: {
        x: Number(((deviceX / naturalWidth) * 100).toFixed(1)),
        y: Number(((deviceY / naturalHeight) * 100).toFixed(1)),
        width: 1,
        height: 1
      },
      coordinates: {
        x: Number(((deviceX / naturalWidth) * 100).toFixed(1)),
        y: Number(((deviceY / naturalHeight) * 100).toFixed(1))
      }
    };
    setSelectedElement(coordinateElem);
    onRecordElement(coordinateElem, action, inspectorMode === 'type' ? inspectorInputText : undefined, e, coordinateMetrics);

    // Locator enrichment is best-effort and must never gate step capture.
    try {
      const email = encodeURIComponent(mobileUserEmail || 'shanmugapriya@qaoncloud.com');
      const response = await fetch(`/api/mobile/app/source?email=${email}`);
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.xml) {
        throw new Error(payload.error || 'UI hierarchy is unavailable');
      }

      const xml = new DOMParser().parseFromString(payload.xml, 'application/xml');
      const candidates = Array.from(xml.querySelectorAll('[bounds]')).flatMap((node) => {
        const bounds = node.getAttribute('bounds') || '';
        const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
        if (!match) return [];
        const [, x1, y1, x2, y2] = match.map(Number);
        if (deviceX < x1 || deviceX > x2 || deviceY < y1 || deviceY > y2) return [];
        return [{ node, bounds, x1, y1, x2, y2, area: (x2 - x1) * (y2 - y1) }];
      });

      const clickableCandidates = candidates.filter(({ node }) => node.getAttribute('clickable') === 'true');
      const match = (clickableCandidates.length ? clickableCandidates : candidates)
        .sort((a, b) => a.area - b.area)[0];

      if (!match) throw new Error('No UIAutomator element at the tapped coordinates');

      const node = match.node;
      const resourceId = node.getAttribute('resource-id') || '';
      const text = node.getAttribute('text') || '';
      const accessibilityId = node.getAttribute('content-desc') || '';
      const type = node.tagName;
      if (/^android:id\/(?:navigationBarBackground|statusBarBackground|content)$/i.test(resourceId)) {
        throw new Error('Ignoring Android system surface');
      }
      if (!resourceId && !text && !accessibilityId) {
        throw new Error('Tapped container has no stable semantic locator');
      }
      const locatorPredicate = resourceId
        ? `@resource-id="${resourceId}"`
        : accessibilityId
          ? `@content-desc="${accessibilityId}"`
          : `@text="${text}"`;
      const inspectedElem: MobileElementInfo = {
        id: resourceId || accessibilityId || `${type}-${match.x1}-${match.y1}`,
        name: text || accessibilityId || (resourceId ? resourceId.split(':id/').pop() : undefined) || type.split('.').pop() || 'Mobile Element',
        type,
        resourceId,
        accessibilityId: accessibilityId || undefined,
        contentDescription: accessibilityId || undefined,
        xpath: `//${type}[${locatorPredicate}]`,
        bounds: match.bounds,
        text: text || undefined,
        screen: activeTab || 'MAIN',
        clickable: node.getAttribute('clickable') === 'true',
        enabled: node.getAttribute('enabled') !== 'false'
      };
      setSelectedElement(inspectedElem);

      // Re-record the same interaction with the real node. The recorder replaces
      // the coordinate placeholder in place, so the step ends up referencing an
      // element that exists in the app's UI hierarchy rather than a screen
      // position that breaks on any other device size.
      onRecordElement(inspectedElem, action, inspectorMode === 'type' ? inspectorInputText : undefined, undefined, {
        ...coordinateMetrics,
        recordOnly: true
      });
    } catch (error: any) {
      console.warn('Recording live tap with coordinate fallback:', error?.message || error);
    }
  };

  return (
    <div className={`bg-slate-950 rounded-[2.5rem] border border-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-500 ${
      isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0 overflow-y-auto' : ''
    }`}>
      
      {/* Top Banner Toolbar */}
      <div className="p-5 border-b border-slate-900 bg-slate-900/90 flex flex-col xl:flex-row xl:items-center justify-between gap-4 sticky top-0 z-40 backdrop-blur-md">
        
        {/* Left: Device & Target Info */}
        <div className="flex items-center gap-4">
          <div 
            className="p-3 rounded-2xl border shrink-0 flex items-center justify-center transition-colors"
            style={{ 
              backgroundColor: `${appMeta.theme.primary}20`,
              borderColor: `${appMeta.theme.primary}40`,
              color: appMeta.theme.accent
            }}
          >
            <Smartphone size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                {liveMobileFrame ? 'Real Android Device' : 'Android Emulator'}: <span className="text-emerald-400 font-bold">{appMeta.displayName}</span>
              </h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] font-bold text-slate-400 flex-wrap">
              <span>Device: <span className="text-emerald-400 font-mono">{mobileDevice || 'emulator-5554 (Android 14)'}</span></span>
              <span>•</span>
              <span>Target Package: <span className="text-indigo-300 font-mono">{pkg}</span></span>
              <span>•</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                {appMeta.category}
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right: App Switcher & Inspector Mode Controls */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Quick App Switcher Dropdown */}
          {onSwitchApp && (
            <div className="flex items-center bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-2 flex items-center gap-1">
                <RotateCcw size={11} className="text-indigo-400" /> App:
              </span>
              <select 
                value={pkg || 'com.saucelabs.mydemoapp.android'}
                onChange={(e) => onSwitchApp(e.target.value)}
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer pr-1"
              >
                <option value="com.saucelabs.mydemoapp.android" className="bg-slate-900 text-white">Sauce Labs My Demo App</option>
                <option value="com.whatsapp" className="bg-slate-900 text-white">WhatsApp Business</option>
                <option value="com.android.chrome" className="bg-slate-900 text-white">Google Chrome</option>
                <option value="com.android.settings" className="bg-slate-900 text-white">Android Settings</option>
                <option value="com.machaxi.app" className="bg-slate-900 text-white">Machaxi Sports</option>
                <option value="in.swiggy.android" className="bg-slate-900 text-white">Swiggy Food Delivery</option>
                <option value="com.amazon.mShop.android.shopping" className="bg-slate-900 text-white">Amazon Shopping</option>
                <option value="com.google.android.apps.nbu.paisa.user" className="bg-slate-900 text-white">Google Pay / Finance</option>
                {availableApps.filter(a => !['com.saucelabs.mydemoapp.android', 'com.whatsapp', 'com.android.chrome', 'com.android.settings', 'com.machaxi.app'].includes(a.package || a.packageName)).map((a, idx) => (
                  <option key={`${a.package || a.packageName || a.id || idx}-${idx}`} value={a.package || a.packageName} className="bg-slate-900 text-white">
                    {a.name || a.appName} ({a.package || a.packageName})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Main Inspector Toggle Button with '+' icon */}
          <button
            onClick={() => {
              setIsInspectorActive(!isInspectorActive);
              toast.info(isInspectorActive ? "Inspector mode paused" : "Inspector mode activated: Click elements to record steps!");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
              isInspectorActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
            }`}
            title="Toggle Element Inspector '+' Mode"
          >
            <Plus size={16} className={`stroke-[3] ${isInspectorActive ? 'animate-spin-slow' : ''}`} />
            {isInspectorActive ? 'Inspector Active (+)' : 'Activate Inspector (+)'}
          </button>

          {/* Action Mode Pills */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setInspectorMode('tap');
                toast.info("Inspector Mode: [Tap / Click]");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                inspectorMode === 'tap' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MousePointer size={12} /> Tap
            </button>
            <button
              onClick={() => {
                setInspectorMode('type');
                toast.info("Inspector Mode: [Type / Fill Text]");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                inspectorMode === 'type' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode size={12} /> Type
            </button>
            <button
              onClick={() => {
                setInspectorMode('assert');
                toast.info("Inspector Mode: [Assert Displayed]");
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                inspectorMode === 'assert' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 size={12} /> Assert
            </button>
          </div>

          {/* Type Text Payload Input */}
          {inspectorMode === 'type' && (
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 animate-in fade-in duration-200">
              <span className="text-indigo-300 font-bold text-[11px]">Payload:</span>
              <input
                type="text"
                value={inspectorInputText || ''}
                onChange={(e) => setInspectorInputText(e.target.value)}
                placeholder="Text to type..."
                className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-indigo-400 w-36"
              />
            </div>
          )}

          {/* Full Screen Toggle Button */}
          <button
            onClick={() => {
              setIsFullscreen(!isFullscreen);
              toast.info(isFullscreen ? "Exited Full Screen" : `Entered ${liveMobileFrame ? 'Live Device' : 'Emulator'} Full Screen Mode`);
            }}
            className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-bold ${
              isFullscreen 
                ? 'bg-indigo-600 text-white shadow-lg' 
                : 'hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
            title={isFullscreen ? "Exit Full Screen" : "Full Screen Emulator View"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid: Left Device Viewport (5 cols or 6 cols in fullscreen), Right Inspector (7 cols or 6 cols) */}
      <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-12 max-w-7xl mx-auto w-full' : 'lg:grid-cols-12'} gap-6 p-6 flex-1`}>
        
        {/* LEFT: Interactive Android Emulator Screen */}
        <div className={`${isFullscreen ? 'lg:col-span-6' : 'lg:col-span-5'} flex flex-col items-center`}>
          
          {/* Dynamic Screen Navigation Tabs for the Active App */}
          {!liveMobileFrame && <div className="w-full max-w-[360px] flex items-center justify-between mb-3 bg-slate-900 p-1 rounded-2xl border border-slate-800 text-[11px] font-bold">
            {appMeta.tabs.map((t) => (
              <button
                key={t.id}
                onClick={(e) => {
                  setActiveTab(t.id);
                  if (appMeta.archetype === 'saucelabs') {
                    if (t.id === 'catalog') setSauceActiveView('catalog');
                    else if (t.id === 'details') setSauceActiveView('details');
                    else if (t.id === 'cart') setSauceActiveView('cart');
                    else if (t.id === 'checkout') setSauceActiveView('checkout_address');
                    else if (t.id === 'login') setSauceActiveView('login');
                  }
                  if (inChatRoom) setInChatRoom(false);
                  handleElementClick({
                    id: `elem-tab-${t.id}`,
                    name: `Tab: ${t.label}`,
                    type: 'android.widget.TabWidget',
                    resourceId: `${pkg}:id/tab_${t.id}`,
                    accessibilityId: t.label,
                    xpath: `//android.widget.TabWidget[@content-desc="${t.label}"]`,
                    bounds: '[0,0][0,0]',
                    text: t.label,
                    clickable: true,
                    enabled: true
                  }, e);
                }}
                className={`flex-1 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === t.id && !inChatRoom
                    ? 'text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{
                  backgroundColor: (activeTab === t.id && !inChatRoom) ? appMeta.theme.primaryHover : 'transparent'
                }}
              >
                <span>{t.label}</span>
                {t.id === 'cart' && appMeta.archetype === 'saucelabs' && sauceCartCount > 0 ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-500 text-white font-mono font-black animate-pulse">
                    {sauceCartCount}
                  </span>
                ) : t.badge ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-black">
                    {t.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>}

          {/* Android Smartphone Frame Container */}
          <div className={`relative ${isFullscreen ? 'w-[380px]' : 'w-[360px]'} bg-slate-950 rounded-[46px] p-3 border-4 border-slate-800 shadow-2xl ring-1 ring-slate-700/50 select-none transition-all duration-300`}>
            
            {/* Top Speaker & Camera Punch-Hole */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full flex items-center justify-center gap-3 z-30 pointer-events-none">
              <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
              <div className="w-2.5 h-2.5 bg-slate-950 rounded-full border border-slate-800"></div>
            </div>

            {/* Inner Phone Screen */}
            <div 
              ref={phoneScreenRef}
              data-mobile-screen="true"
              className={`relative w-full ${isFullscreen ? 'h-[640px]' : 'h-[580px]'} bg-slate-950 rounded-[36px] overflow-hidden flex flex-col border border-slate-900 ${
                isInspectorActive ? 'cursor-crosshair' : 'cursor-default'
              }`}
            >
              {/* A real device session must render the ADB screencast, never the simulated app. */}
              {liveMobileFrame && (
                <img
                  src={liveMobileFrame}
                  alt={`Live Android device ${mobileDevice}`}
                  onPointerDown={handleLiveFrameClick}
                  className={`absolute inset-0 z-[100] h-full w-full bg-black object-contain ${isInspectorActive ? 'cursor-crosshair' : 'cursor-default'}`}
                  draggable={false}
                />
              )}
              
              {/* Android Status Bar */}
              <div className="pt-2 px-5 pb-1 flex items-center justify-between text-[10px] font-bold text-slate-400 bg-slate-950/90 z-20">
                <span>09:41</span>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <Wifi size={11} className="text-emerald-400" />
                  <span>5G</span>
                  <Battery size={13} className="text-emerald-400" />
                </div>
              </div>

              {/* Dynamic App Launching & Booting Overlay */}
              {isLaunchingApp && (
                <div className="absolute inset-0 bg-slate-950/95 z-40 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                  <div 
                    className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 border shadow-2xl animate-bounce"
                    style={{ 
                      backgroundColor: `${appMeta.theme.primary}30`,
                      borderColor: appMeta.theme.accent,
                      color: appMeta.theme.accent
                    }}
                  >
                    <Smartphone size={32} />
                  </div>
                  <h4 className="text-sm font-black text-white">{appMeta.displayName}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[260px]">{pkg}</p>

                  <div className="w-full max-w-[220px] bg-slate-800 h-2 rounded-full mt-5 overflow-hidden">
                    <div 
                      className="h-full bg-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${launchProgress}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-emerald-400 font-mono mt-3 animate-pulse px-2">
                    {launchStepText}
                  </p>
                </div>
              )}

              {/* Hover Element Overlay Banner */}
              {isInspectorActive && hoveredElement && (
                <div className="absolute top-8 left-3 right-3 bg-slate-900/95 border border-emerald-400/80 text-emerald-300 px-2.5 py-1 rounded-xl text-[10px] font-mono shadow-2xl flex items-center justify-between z-30 animate-in fade-in duration-200">
                  <span className="truncate font-bold flex items-center gap-1">
                    <span className="text-emerald-400 font-black">+</span> {hoveredElement.name}
                  </span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">
                    {(hoveredElement.resourceId ? hoveredElement.resourceId.split(':id/')[1] : undefined) || hoveredElement.type.split('.').pop()}
                  </span>
                </div>
              )}

              {/* Touch Ripple Visual Effects */}
              {touchRipples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute pointer-events-none rounded-full bg-emerald-400/50 border-2 border-white shadow-lg animate-ping z-40"
                  style={{
                    left: `${ripple.x - 14}px`,
                    top: `${ripple.y - 14}px`,
                    width: '28px',
                    height: '28px'
                  }}
                />
              ))}

              {/* Dynamic Interactive App Screen Content */}
              <div className="flex-1 overflow-y-auto px-3.5 py-2 space-y-3 z-10 scrollbar-none relative">
                
                {/* 1. SAUCE LABS MOBILE SAMPLE APP ARCHETYPE */}
                {appMeta.archetype === 'saucelabs' && (
                  <div className="space-y-3">
                    
                    {/* Top App Bar with Sauce Logo, Drawer Hamburger, Sort, & Cart Badge */}
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                      <button
                        onClick={(e) => {
                          setSauceDrawerOpen(!sauceDrawerOpen);
                          handleElementClick(currentElements[0], e);
                        }}
                        className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer transition-colors"
                        title="Open Menu"
                      >
                        <Menu size={20} />
                      </button>

                      <div className="flex items-center gap-1.5">
                        <img 
                          src={SAUCE_LABS_ASSETS.swag_header_logo || SAUCE_LABS_ASSETS.icon} 
                          alt="Swag Labs"
                          referrerPolicy="no-referrer"
                          className="h-6 w-auto max-w-[120px] object-contain drop-shadow"
                          onError={(e) => {
                            // Fallback if image load fails
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-xs font-black tracking-tight text-white uppercase drop-shadow">
                          Swag Labs
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {sauceActiveView === 'catalog' && (
                          <button
                            onClick={(e) => {
                              setSauceShowSortModal(!sauceShowSortModal);
                              handleElementClick(currentElements[2] || currentElements[0], e);
                            }}
                            className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                            title="Sort Items"
                          >
                            <Filter size={17} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            setSauceActiveView('cart');
                            setActiveTab('cart');
                            handleElementClick(currentElements[1] || currentElements[0], e);
                          }}
                          className="relative p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                          title="View Cart"
                        >
                          <ShoppingCart size={19} />
                          {sauceCartCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-md">
                              {sauceCartCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Side Navigation Drawer Overlay */}
                    {sauceDrawerOpen && (
                      <div className="absolute inset-0 bg-slate-950/95 z-40 rounded-3xl p-4 flex flex-col justify-between animate-in slide-in-from-left duration-200 border border-slate-800">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-xs">
                                S
                              </div>
                              <span className="text-sm font-black text-white">Sauce Labs Mobile</span>
                            </div>
                            <button
                              onClick={() => setSauceDrawerOpen(false)}
                              className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          <div className="space-y-1 text-xs font-bold text-slate-200">
                            <button
                              onClick={(e) => {
                                setSauceActiveView('catalog');
                                setActiveTab('catalog');
                                setSauceDrawerOpen(false);
                                toast.info("Navigated to Products Catalog");
                                handleElementClick({
                                  id: 'elem-drawer-catalog',
                                  name: 'Menu: All Items / Catalog',
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_catalog`,
                                  accessibilityId: 'All Items',
                                  xpath: `//android.widget.TextView[@text="All Items / Catalog"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'All Items',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer transition-colors"
                            >
                              <ShoppingBag size={16} className="text-red-400" />
                              <span>All Items / Catalog</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setSauceActiveView('webview');
                                setSauceDrawerOpen(false);
                                toast.info("Opened Sauce Labs Webview");
                                handleElementClick({
                                  id: 'elem-drawer-webview',
                                  name: 'Menu: Webview',
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_webview`,
                                  accessibilityId: 'Webview',
                                  xpath: `//android.widget.TextView[@text="Webview"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'Webview',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer transition-colors"
                            >
                              <Globe size={16} className="text-blue-400" />
                              <span>Webview</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setSauceActiveView('qr_scanner');
                                setSauceDrawerOpen(false);
                                toast.info("Opened QR Code Scanner");
                                handleElementClick({
                                  id: 'elem-drawer-qr',
                                  name: 'Menu: QR Code Scanner',
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_qr`,
                                  accessibilityId: 'QR Code Scanner',
                                  xpath: `//android.widget.TextView[@text="QR Code Scanner"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'QR Code Scanner',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer transition-colors"
                            >
                              <QrCode size={16} className="text-emerald-400" />
                              <span>QR Code Scanner</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setSauceActiveView('drawing');
                                setSauceDrawerOpen(false);
                                toast.info("Opened Drawing Pad");
                                handleElementClick({
                                  id: 'elem-drawer-drawing',
                                  name: 'Menu: Drawing',
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_drawing`,
                                  accessibilityId: 'Drawing',
                                  xpath: `//android.widget.TextView[@text="Drawing"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'Drawing',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer transition-colors"
                            >
                              <PenTool size={16} className="text-amber-400" />
                              <span>Drawing</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setSauceCart([]);
                                setSauceDrawerOpen(false);
                                toast.success("Reset App State Completed!");
                                handleElementClick({
                                  id: 'elem-drawer-reset',
                                  name: 'Menu: Reset App State',
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_reset`,
                                  accessibilityId: 'Reset App State',
                                  xpath: `//android.widget.TextView[@text="Reset App State"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'Reset App State',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer text-amber-400 transition-colors"
                            >
                              <RotateCcw size={16} />
                              <span>Reset App State</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setSauceActiveView('login');
                                setActiveTab('login');
                                setSauceDrawerOpen(false);
                                handleElementClick({
                                  id: 'elem-drawer-login',
                                  name: `Menu: ${sauceIsLoggedIn ? 'Log Out' : 'Log In'}`,
                                  type: 'android.widget.TextView',
                                  resourceId: `${pkg}:id/item_menu_login`,
                                  accessibilityId: sauceIsLoggedIn ? 'Log Out' : 'Log In',
                                  xpath: `//android.widget.TextView[@text="${sauceIsLoggedIn ? 'Log Out' : 'Log In'}"]`,
                                  bounds: '[0,0][0,0]',
                                  text: sauceIsLoggedIn ? 'Log Out' : 'Log In',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-900 text-left cursor-pointer text-red-400 transition-colors"
                            >
                              {sauceIsLoggedIn ? <LogOut size={16} /> : <LogIn size={16} />}
                              <span>{sauceIsLoggedIn ? 'Log Out' : 'Log In'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center font-mono">
                          Sauce Labs Sample App v2.7.1
                        </div>
                      </div>
                    )}

                    {/* VIEW 1: PRODUCTS CATALOG */}
                    {sauceActiveView === 'catalog' && (
                      <div className="space-y-3">
                        
                        {/* Search Filter Bar */}
                        <div 
                          onClick={(e) => handleElementClick(currentElements[3] || currentElements[0], e)}
                          className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-2xl border border-slate-800 cursor-pointer"
                        >
                          <Search size={13} className="text-slate-400" />
                          <input 
                            type="text"
                            value={sauceSearchFilter}
                            onChange={(e) => setSauceSearchFilter(e.target.value)}
                            placeholder="Search Swag products..."
                            className="bg-transparent text-xs text-white focus:outline-none w-full placeholder-slate-500"
                          />
                          {sauceSearchFilter && (
                            <button onClick={() => setSauceSearchFilter('')} className="text-slate-400 hover:text-white">
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Sort Selector Bar */}
                        {sauceShowSortModal && (
                          <div className="p-2.5 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between text-[11px] animate-in fade-in duration-150">
                            <span className="text-slate-400 font-bold">Sort By:</span>
                            <select
                              value={sauceSortOption}
                              onChange={(e) => {
                                setSauceSortOption(e.target.value as any);
                                setSauceShowSortModal(false);
                                toast.info(`Sorted by ${e.target.value}`);
                              }}
                              className="bg-slate-950 text-white font-bold px-2 py-1 rounded-lg border border-slate-800 text-[10px] cursor-pointer outline-none"
                            >
                              <option value="name_asc">Name (A to Z)</option>
                              <option value="name_desc">Name (Z to A)</option>
                              <option value="price_asc">Price (Low to High)</option>
                              <option value="price_desc">Price (High to Low)</option>
                            </select>
                          </div>
                        )}

                        {/* Catalog Header Title */}
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-xs font-black tracking-wider text-slate-300 uppercase">
                            PRODUCTS ({displayedProducts.length})
                          </h4>
                          <span className="text-[10px] font-mono text-slate-500">
                            Sauce Swag Store
                          </span>
                        </div>

                        {/* Products List Cards */}
                        <div className="space-y-2.5">
                          {displayedProducts.map((item) => (
                            <div 
                              key={item.id}
                              className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 transition-all space-y-2.5 group"
                            >
                              <div 
                                onClick={(e) => {
                                  setSauceSelectedProduct(item);
                                  setSauceProductQuantity(1);
                                  setSauceActiveView('details');
                                  setActiveTab('details');
                                  handleElementClick({
                                    id: `elem-sauce-product-${item.id}`,
                                    name: `Product Card: ${item.name}`,
                                    type: 'android.widget.TextView',
                                    resourceId: `${pkg}:id/titleTV`,
                                    accessibilityId: item.name,
                                    xpath: `//android.widget.TextView[@text="${item.name}"]`,
                                    bounds: '[40,300][800,360]',
                                    text: item.name,
                                    clickable: true,
                                    enabled: true
                                  }, e);
                                }}
                                className="flex gap-3 cursor-pointer"
                              >
                                <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-white shrink-0 shadow-md p-1 overflow-hidden relative group-hover:border-red-500/50 transition-all">
                                  <img 
                                    src={getSauceProductImage(item.id)} 
                                    alt={item.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-contain drop-shadow"
                                    onError={(e) => {
                                      // Fallback to icon
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <div className="flex items-center gap-1.5">
                                    <h5 className="text-xs font-black text-white truncate">{item.name}</h5>
                                    {item.badge && (
                                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-600/90 text-white shrink-0 uppercase tracking-wider">
                                        {item.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                                    {item.desc}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="flex items-center text-amber-400 text-[9px] font-bold">
                                      <Star size={10} className="fill-amber-400 mr-0.5" />
                                      {item.rating} ({item.reviews})
                                    </div>
                                    <span className="text-[11px] font-black text-emerald-400 font-mono">
                                      ${item.price.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                                <button
                                  onClick={(e) => {
                                    toggleSauceCartItem(item);
                                    handleElementClick({
                                      id: `elem-sauce-btn-cart-${item.id}`,
                                      name: `${isProductInCart(item.id) ? 'Remove From Cart' : 'Add To Cart'}: ${item.name}`,
                                      type: 'android.widget.Button',
                                      resourceId: `${pkg}:id/cartBt`,
                                      accessibilityId: `${isProductInCart(item.id) ? 'Remove' : 'Add To Cart'} ${item.name}`,
                                      xpath: `//android.widget.Button[@content-desc="${isProductInCart(item.id) ? 'Remove' : 'Add To Cart'} ${item.name}"]`,
                                      bounds: '[780,400][1020,460]',
                                      text: isProductInCart(item.id) ? 'Remove' : 'Add to Cart',
                                      clickable: true,
                                      enabled: true
                                    }, e);
                                  }}
                                  className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
                                    isProductInCart(item.id)
                                      ? 'bg-slate-800 text-red-400 hover:bg-slate-700 border border-red-500/40'
                                      : 'bg-red-600 hover:bg-red-500 text-white'
                                  }`}
                                >
                                  {isProductInCart(item.id) ? 'REMOVE' : 'ADD TO CART'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                      </div>
                    )}

                    {/* VIEW 2: PRODUCT DETAILS */}
                    {sauceActiveView === 'details' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <button
                          onClick={() => {
                            setSauceActiveView('catalog');
                            setActiveTab('catalog');
                          }}
                          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                        >
                          <ChevronRight size={16} className="rotate-180" /> Back to Products
                        </button>

                        <div className="w-full h-48 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center p-3 shadow-xl relative overflow-hidden group">
                          <img 
                            src={getSauceProductImage(sauceSelectedProduct.id)} 
                            alt={sauceSelectedProduct.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain drop-shadow-2xl transition-transform group-hover:scale-105"
                          />
                          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-red-600/90 text-white text-[9px] font-black uppercase tracking-wider shadow">
                            {sauceSelectedProduct.badge || 'OFFICIAL SWAG'}
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-sm font-black text-white">{sauceSelectedProduct.name}</h4>
                              <div className="flex items-center gap-1 text-amber-400 text-xs font-bold mt-0.5">
                                <Star size={11} className="fill-amber-400" />
                                <span>{sauceSelectedProduct.rating} ({sauceSelectedProduct.reviews} reviews)</span>
                              </div>
                            </div>
                            <span className="text-base font-black text-emerald-400">
                              ${sauceSelectedProduct.price.toFixed(2)}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                            {sauceSelectedProduct.desc}
                          </p>

                          {/* Color Selector */}
                          <div className="pt-2">
                            <span className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase">Select Color:</span>
                            <div className="flex items-center gap-2">
                              {['Red', 'Blue', 'Black', 'Gray'].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => setSauceSelectedColor(c)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                    sauceSelectedColor === c 
                                      ? 'bg-red-600 text-white ring-2 ring-red-400' 
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quantity Counter */}
                          <div className="pt-2 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400">Quantity:</span>
                            <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                              <button 
                                onClick={() => setSauceProductQuantity(Math.max(1, sauceProductQuantity - 1))}
                                className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-white font-black cursor-pointer hover:bg-slate-700"
                              >
                                -
                              </button>
                              <span className="text-xs font-black text-white font-mono">{sauceProductQuantity}</span>
                              <button 
                                onClick={() => setSauceProductQuantity(sauceProductQuantity + 1)}
                                className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-white font-black cursor-pointer hover:bg-slate-700"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              const existing = sauceCart.find(i => i.product.id === sauceSelectedProduct.id);
                              if (existing) {
                                existing.quantity += sauceProductQuantity;
                                setSauceCart([...sauceCart]);
                              } else {
                                setSauceCart(prev => [...prev, { product: sauceSelectedProduct, quantity: sauceProductQuantity, color: sauceSelectedColor }]);
                              }
                              toast.success(`Added ${sauceProductQuantity}x ${sauceSelectedProduct.name} to Cart!`);
                              handleElementClick(currentElements[currentElements.length - 1] || currentElements[0], e);
                            }}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer mt-2"
                          >
                            Add To Cart (${(sauceSelectedProduct.price * sauceProductQuantity).toFixed(2)})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* VIEW 3: CART */}
                    {sauceActiveView === 'cart' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">YOUR CART</h4>
                          <span className="text-xs font-bold text-slate-400">{sauceCartCount} Items</span>
                        </div>

                        {sauceCart.length === 0 ? (
                          <div className="py-12 text-center space-y-3 bg-slate-900 rounded-2xl border border-slate-800">
                            <ShoppingCart size={32} className="mx-auto text-slate-500" />
                            <p className="text-xs font-bold text-slate-400">Your cart is currently empty!</p>
                            <button
                              onClick={() => {
                                setSauceActiveView('catalog');
                                setActiveTab('catalog');
                              }}
                              className="px-4 py-2 bg-red-600 text-white text-xs font-black rounded-xl cursor-pointer"
                            >
                              Explore Swag Catalog
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {sauceCart.map((item) => (
                              <div key={item.product.id} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                                <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                                  <img 
                                    src={getSauceProductImage(item.product.id)} 
                                    alt={item.product.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-contain drop-shadow"
                                  />
                                </div>
                                <div className="space-y-0.5 flex-1 min-w-0">
                                  <h5 className="text-xs font-black text-white truncate">{item.product.name}</h5>
                                  <p className="text-[10px] text-slate-400">Qty: {item.quantity} • {item.color}</p>
                                  <span className="text-xs font-black text-emerald-400 font-mono">${(item.product.price * item.quantity).toFixed(2)}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setSauceCart(prev => prev.filter(i => i.product.id !== item.product.id));
                                    toast.info(`Removed ${item.product.name} from Cart`);
                                  }}
                                  className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                                  title="Remove item"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}

                            <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-1.5 text-xs">
                              <div className="flex justify-between text-slate-400">
                                <span>Subtotal</span>
                                <span className="font-mono text-white">${sauceSubtotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Estimated Tax</span>
                                <span className="font-mono text-white">${sauceTax.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-black text-sm text-white pt-1.5 border-t border-slate-800">
                                <span>Total Price</span>
                                <span className="text-emerald-400 font-mono">${sauceTotal}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                onClick={() => {
                                  setSauceActiveView('catalog');
                                  setActiveTab('catalog');
                                }}
                                className="py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 cursor-pointer"
                              >
                                Continue Shopping
                              </button>
                              <button
                                onClick={(e) => {
                                  setSauceActiveView('checkout_address');
                                  setActiveTab('checkout');
                                  handleElementClick(currentElements[currentElements.length - 1] || currentElements[0], e);
                                }}
                                className="py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer"
                              >
                                Checkout (${sauceTotal})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* VIEW 4: CHECKOUT ADDRESS FORM */}
                    {sauceActiveView === 'checkout_address' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">CHECKOUT: ADDRESS</h4>
                          <span className="text-[10px] font-mono text-red-400">Step 1 of 3</span>
                        </div>

                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Full Name *</label>
                            <input 
                              type="text"
                              value={sauceAddress.fullName}
                              onChange={(e) => setSauceAddress({ ...sauceAddress, fullName: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Address Line 1 *</label>
                            <input 
                              type="text"
                              value={sauceAddress.address1}
                              onChange={(e) => setSauceAddress({ ...sauceAddress, address1: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">City *</label>
                              <input 
                                type="text"
                                value={sauceAddress.city}
                                onChange={(e) => setSauceAddress({ ...sauceAddress, city: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Zip Code *</label>
                              <input 
                                type="text"
                                value={sauceAddress.zip}
                                onChange={(e) => setSauceAddress({ ...sauceAddress, zip: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                              />
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              setSauceActiveView('checkout_payment');
                              toast.success("Shipping Address Saved!");
                              handleElementClick(currentElements[currentElements.length - 1] || currentElements[0], e);
                            }}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer mt-2"
                          >
                            To Payment <ArrowRight size={13} className="inline ml-1" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* VIEW 5: CHECKOUT PAYMENT FORM */}
                    {sauceActiveView === 'checkout_payment' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">CHECKOUT: PAYMENT</h4>
                          <span className="text-[10px] font-mono text-red-400">Step 2 of 3</span>
                        </div>

                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Name on Card *</label>
                            <input 
                              type="text"
                              value={saucePayment.cardName}
                              onChange={(e) => setSaucePayment({ ...saucePayment, cardName: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Card Number *</label>
                            <input 
                              type="text"
                              value={saucePayment.cardNumber}
                              onChange={(e) => setSaucePayment({ ...saucePayment, cardNumber: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-mono font-bold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Exp Date (MM/YY) *</label>
                              <input 
                                type="text"
                                value={saucePayment.cardExp}
                                onChange={(e) => setSaucePayment({ ...saucePayment, cardExp: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-mono font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Security Code *</label>
                              <input 
                                type="password"
                                value={saucePayment.cardCvv}
                                onChange={(e) => setSaucePayment({ ...saucePayment, cardCvv: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-mono font-bold"
                              />
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              setSauceActiveView('checkout_review');
                              toast.success("Payment Method Verified!");
                              handleElementClick(currentElements[currentElements.length - 1] || currentElements[0], e);
                            }}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer mt-2"
                          >
                            Review Order <ArrowRight size={13} className="inline ml-1" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* VIEW 6: CHECKOUT REVIEW & PLACE ORDER */}
                    {sauceActiveView === 'checkout_review' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">CHECKOUT: OVERVIEW</h4>
                          <span className="text-[10px] font-mono text-emerald-400">Step 3 of 3</span>
                        </div>

                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2 text-xs">
                          <h5 className="font-bold text-white flex items-center gap-1.5">
                            <Truck size={14} className="text-red-400" /> Shipping Summary
                          </h5>
                          <p className="text-[11px] text-slate-300">{sauceAddress.fullName}</p>
                          <p className="text-[10px] text-slate-400">{sauceAddress.address1}, {sauceAddress.city}, {sauceAddress.zip}</p>
                          <p className="text-[10px] text-slate-400">Payment: Card ending in **** {saucePayment.cardNumber.slice(-4)}</p>
                          
                          <div className="pt-2 border-t border-slate-800 flex justify-between font-black text-white">
                            <span>Total Due</span>
                            <span className="text-emerald-400 font-mono">${sauceTotal}</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            setSauceActiveView('checkout_complete');
                            setSauceCart([]);
                            toast.success("Order Placed Successfully!");
                            handleElementClick(currentElements[currentElements.length - 1] || currentElements[0], e);
                          }}
                          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xl cursor-pointer"
                        >
                          Place Order (${sauceTotal}) <Check size={14} className="inline ml-1" />
                        </button>
                      </div>
                    )}

                    {/* VIEW 7: CHECKOUT COMPLETE */}
                    {sauceActiveView === 'checkout_complete' && (
                      <div className="py-8 text-center space-y-3 bg-slate-900 rounded-2xl border border-slate-800 animate-in zoom-in-95 duration-300">
                        <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-xl animate-bounce">
                          <CheckCircle size={32} />
                        </div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">CHECKOUT COMPLETE!</h4>
                        <p className="text-xs text-slate-300 max-w-[240px] mx-auto">
                          Thank you for your order! Your order has been dispatched and will arrive as fast as the pony can get there!
                        </p>
                        <button
                          onClick={() => {
                            setSauceActiveView('catalog');
                            setActiveTab('catalog');
                          }}
                          className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-xl cursor-pointer shadow-md"
                        >
                          BACK HOME
                        </button>
                      </div>
                    )}

                    {/* VIEW 8: LOGIN SCREEN */}
                    {sauceActiveView === 'login' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="text-center py-2">
                          <div className="w-10 h-10 bg-red-600 rounded-2xl flex items-center justify-center text-white font-black text-lg mx-auto mb-1 shadow-md">
                            S
                          </div>
                          <h4 className="text-sm font-black text-white">Sauce Labs Login</h4>
                          <p className="text-[10px] text-slate-400">Enter your Swag Labs test credentials</p>
                        </div>

                        {sauceLoginError && (
                          <div className="p-2.5 bg-red-950/80 border border-red-500/80 rounded-xl flex items-center gap-2 text-red-200 text-xs animate-in shake duration-200">
                            <AlertTriangle size={14} className="text-red-400 shrink-0" />
                            <span className="text-[11px] leading-tight">{sauceLoginError}</span>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Username</label>
                            <input 
                              type="text"
                              value={sauceLoginUsername}
                              onChange={(e) => setSauceLoginUsername(e.target.value)}
                              placeholder="Username"
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-400 block mb-1 uppercase">Password</label>
                            <input 
                              type="password"
                              value={sauceLoginPassword}
                              onChange={(e) => setSauceLoginPassword(e.target.value)}
                              placeholder="Password"
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                            />
                          </div>

                          <div className="flex items-center justify-between py-1">
                            <span className="text-[11px] font-bold text-slate-400">Biometric Face / Fingerprint</span>
                            <button
                              onClick={() => setSauceBiometrics(!sauceBiometrics)}
                              className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors cursor-pointer ${
                                sauceBiometrics ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'
                              }`}
                            >
                              <div className="w-4 h-4 bg-white rounded-full"></div>
                            </button>
                          </div>

                          <button
                            onClick={(e) => {
                              if (sauceLoginUsername === 'locked_out_user') {
                                setSauceLoginError('Sorry, this user has been locked out.');
                                toast.error('User is locked out!');
                              } else if (sauceLoginUsername && sauceLoginPassword === 'secret_sauce') {
                                setSauceIsLoggedIn(true);
                                setSauceLoginError('');
                                setSauceActiveView('catalog');
                                setActiveTab('catalog');
                                toast.success(`Logged in as ${sauceLoginUsername}!`);
                              } else {
                                setSauceLoginError('Username and password do not match any user.');
                              }
                              handleElementClick(currentElements[2] || currentElements[0], e);
                            }}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer"
                          >
                            LOGIN
                          </button>
                        </div>

                        {/* Test Credentials Helper Pills */}
                        <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">ACCEPTED USERNAMES:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {['standard_user', 'locked_out_user', 'problem_user'].map((u) => (
                              <button
                                key={u}
                                onClick={() => {
                                  setSauceLoginUsername(u);
                                  setSauceLoginPassword('secret_sauce');
                                }}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-950 text-indigo-300 border border-slate-800 hover:border-indigo-400 cursor-pointer"
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono block pt-0.5">Password for all: secret_sauce</span>
                        </div>
                      </div>
                    )}

                    {/* VIEW 9: WEBVIEW */}
                    {sauceActiveView === 'webview' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-300">
                          <Lock size={12} className="text-emerald-400" />
                          <span>https://saucelabs.com</span>
                        </div>
                        <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-2">
                          <Globe size={32} className="mx-auto text-red-400" />
                          <h5 className="text-xs font-black text-white">Sauce Labs Webview</h5>
                          <p className="text-[10px] text-slate-400">Continuous Testing Cloud & Real Device Platform</p>
                        </div>
                      </div>
                    )}

                    {/* VIEW 10: QR SCANNER */}
                    {sauceActiveView === 'qr_scanner' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="p-8 bg-slate-900 rounded-2xl border border-slate-800 text-center space-y-3 relative overflow-hidden">
                          <div className="w-36 h-36 mx-auto border-2 border-dashed border-red-500 rounded-2xl flex items-center justify-center relative">
                            <QrCode size={54} className="text-slate-400" />
                            <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-500 shadow-md animate-pulse"></div>
                          </div>
                          <p className="text-xs font-bold text-slate-300">Align QR Code within the frame</p>
                        </div>
                      </div>
                    )}

                    {/* VIEW 11: DRAWING PAD */}
                    {sauceActiveView === 'drawing' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="w-full h-48 bg-slate-900 rounded-2xl border-2 border-slate-800 flex flex-col items-center justify-center text-slate-500 cursor-crosshair">
                          <PenTool size={28} className="mb-1 text-amber-400" />
                          <span className="text-[10px] font-mono">Touch & Drag to Draw</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => toast.info("Drawing Cleared")} className="py-2 bg-slate-900 text-slate-300 rounded-xl text-xs font-bold border border-slate-800">
                            Clear Pad
                          </button>
                          <button onClick={() => toast.success("Drawing Saved!")} className="py-2 bg-red-600 text-white rounded-xl text-xs font-black">
                            Save Drawing
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* 2. WHATSAPP ARCHETYPE */}
                {appMeta.archetype === 'whatsapp' && (
                  inChatRoom ? (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between p-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => {
                              setInChatRoom(false);
                              handleElementClick({
                                id: 'elem-chat-back',
                                name: 'Chat Back Button',
                                type: 'android.widget.ImageButton',
                                resourceId: `${pkg}:id/btn_chat_back`,
                                accessibilityId: 'Navigate Up',
                                xpath: `//android.widget.ImageButton[@content-desc="Navigate Up"]`,
                                bounds: '[0,0][0,0]',
                                text: 'Back',
                                clickable: true,
                                enabled: true
                              }, e);
                            }} 
                            className="p-1 text-emerald-300 hover:text-white rounded-lg cursor-pointer"
                          >
                            <ChevronRight size={16} className="rotate-180" />
                          </button>
                          <div>
                            <h5 className="text-xs font-black text-white">QA Team Lead</h5>
                            <p className="text-[9px] text-emerald-400">Online • UiAutomator2</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 py-2">
                        {chatMessages.map((m, idx) => (
                          <div key={idx} className={`flex ${m.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-2.5 rounded-2xl text-[11px] font-medium leading-relaxed ${
                              m.sender === 'me' ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-slate-200 border border-slate-800'
                            }`}>
                              <p>{m.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Chat Message Input Bar */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                        <input
                          type="text"
                          value={chatInputText}
                          onChange={(e) => setChatInputText(e.target.value)}
                          onBlur={(e) => {
                            if (chatInputText) {
                              onRecordElement({
                                id: 'elem-chat-input',
                                name: 'Chat Message Input',
                                type: 'android.widget.EditText',
                                resourceId: `${pkg}:id/entry`,
                                accessibilityId: 'Message',
                                xpath: `//android.widget.EditText[@resource-id="${pkg}:id/entry"]`,
                                bounds: '[0,0][0,0]',
                                text: chatInputText,
                                clickable: true,
                                enabled: true
                              }, 'fill', chatInputText, e);
                            }
                          }}
                          placeholder="Type a message..."
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={(e) => {
                            if (!chatInputText.trim()) return;
                            const text = chatInputText;
                            setChatMessages(prev => [...prev, { sender: 'me', text, time: '09:41' }]);
                            setChatInputText('');
                            handleElementClick({
                              id: 'elem-chat-send',
                              name: 'Send Message Button',
                              type: 'android.widget.ImageButton',
                              resourceId: `${pkg}:id/send`,
                              accessibilityId: 'Send',
                              xpath: `//android.widget.ImageButton[@content-desc="Send"]`,
                              bounds: '[0,0][0,0]',
                              text: 'Send',
                              clickable: true,
                              enabled: true
                            }, e);
                          }}
                          className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl cursor-pointer"
                        >
                          <Send size={15} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div 
                        onClick={(e) => {
                          setInChatRoom(true);
                          handleElementClick({
                            id: 'elem-chat-lead',
                            name: 'Chat: QA Team Lead (Alex)',
                            type: 'android.widget.RelativeLayout',
                            resourceId: `${pkg}:id/chat_item_alex`,
                            accessibilityId: 'Chat QA Team Lead Alex',
                            xpath: `//android.widget.TextView[@text="QA Team Lead (Alex)"]`,
                            bounds: '[0,0][0,0]',
                            text: 'QA Team Lead (Alex)',
                            clickable: true,
                            enabled: true
                          }, e);
                        }}
                        className="p-3 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">AL</div>
                          <div>
                            <h5 className="text-xs font-black text-white">QA Team Lead (Alex)</h5>
                            <p className="text-[10px] text-slate-400">AutomatiQA Appium runner ready...</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* 3. CHROME / BROWSER ARCHETYPE */}
                {appMeta.archetype === 'chrome' && (
                  <div className="space-y-3 pt-1">
                    <div 
                      onClick={(e) => {
                        handleElementClick({
                          id: 'elem-chrome-url-bar',
                          name: 'Chrome URL Address Bar',
                          type: 'android.widget.EditText',
                          resourceId: `${pkg}:id/url_bar`,
                          accessibilityId: 'Search or type URL',
                          xpath: `//android.widget.EditText[@resource-id="${pkg}:id/url_bar"]`,
                          bounds: '[0,0][0,0]',
                          text: chromeUrl,
                          clickable: true,
                          enabled: true
                        }, e);
                      }}
                      className="p-2.5 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Lock size={12} className="text-emerald-400" />
                        <span className="text-xs font-mono text-slate-200">{chromeUrl}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3.5 QALCULATE PRO ANDROID APP ARCHETYPE */}
                {appMeta.archetype === 'qalculate' && (
                  <div className="space-y-3 pt-0.5 animate-in fade-in duration-300">
                    
                    {/* QALculate Header App Bar */}
                    <div className="p-3 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 rounded-2xl border border-cyan-500/30 flex items-center justify-between shadow-lg">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner">
                          <Calculator size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-black text-white tracking-wide">QALculate Pro</h4>
                            <span className="text-[8px] font-mono font-black px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                              v4.2
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-400 font-mono">Advanced Scientific & Math Engine</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {calcMemory !== 0 && (
                          <span className="text-[9px] font-mono font-black px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md">
                            M={calcMemory}
                          </span>
                        )}
                        <button
                          onClick={(e) => handleCalcButtonClick('RAD_DEG', 'elem-calc-btn-deg-rad', 'btn_deg_rad', e)}
                          className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                            calcRadMode 
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-sm shadow-cyan-500/20' 
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                          title="Toggle Angle Unit (RAD / DEG)"
                        >
                          {calcRadMode ? 'RAD' : 'DEG'}
                        </button>
                      </div>
                    </div>

                    {/* Screen Tabs Ribbon */}
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
                      {[
                        { id: 'standard', label: 'Standard', icon: Calculator },
                        { id: 'scientific', label: 'Scientific', icon: Sparkles },
                        { id: 'converter', label: 'Converter', icon: ArrowLeftRight },
                        { id: 'history', label: 'History', icon: History }
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={(e) => {
                              setActiveTab(tab.id);
                              onRecordElement({
                                id: `elem-calc-tab-${tab.id}`,
                                name: `QALculate ${tab.label} Tab`,
                                type: 'android.widget.TabWidget',
                                resourceId: `${pkg}:id/tab_${tab.id}`,
                                xpath: `//android.widget.TabWidget[@content-desc="${tab.label}"]`,
                                bounds: '[0,0][0,0]',
                                text: tab.label,
                                clickable: true,
                                enabled: true
                              }, 'click', tab.label, e);
                            }}
                            className={`py-1.5 px-1 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                              isActive
                                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            <Icon size={11} />
                            <span className="truncate">{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* VIEW 1: STANDARD & SCIENTIFIC CALCULATOR */}
                    {(activeTab === 'standard' || activeTab === 'scientific') && (
                      <div className="space-y-2.5 animate-in fade-in duration-200">
                        
                        {/* LCD Display Screen */}
                        <div 
                          onClick={(e) => {
                            const formulaElem = currentElements.find(el => el.resourceId?.endsWith('txt_formula')) || currentElements[0];
                            handleElementClick(formulaElem, e);
                          }}
                          className="p-3 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner flex flex-col justify-between min-h-[92px] cursor-pointer hover:border-cyan-500/40 transition-colors relative group"
                        >
                          {/* Top Info Bar */}
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              {calcRadMode ? 'RAD' : 'DEG'} • QALCULATE ENGINE
                            </span>
                            <span className="text-[9px] text-slate-500 group-hover:text-cyan-400 transition-colors">
                              Tap to Inspect Display
                            </span>
                          </div>

                          {/* Formula Line */}
                          <div className="text-right overflow-x-auto custom-scrollbar font-mono text-base font-semibold text-slate-200 tracking-wider py-0.5">
                            {calcDisplay}
                          </div>

                          {/* Result Output Line */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              const resultElem = currentElements.find(el => el.resourceId?.endsWith('txt_result')) || currentElements[1] || currentElements[0];
                              handleElementClick(resultElem, e);
                            }}
                            className="text-right font-mono text-lg font-black text-cyan-300 tracking-tight flex items-center justify-end gap-1.5"
                          >
                            <span className="text-xs text-slate-500 font-bold">=</span>
                            <span className="bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-500/30 shadow-sm">
                              {calcResult}
                            </span>
                          </div>
                        </div>

                        {/* Quick Memory & Modifier Ribbon */}
                        <div className="grid grid-cols-6 gap-1 text-[10px] font-mono font-bold">
                          <button
                            onClick={(e) => handleCalcButtonClick('RAD_DEG', 'elem-calc-btn-deg-rad', 'btn_deg_rad', e)}
                            className={`py-1 rounded-lg border transition-all cursor-pointer ${
                              calcRadMode ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                          >
                            {calcRadMode ? 'RAD' : 'DEG'}
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('INV', 'elem-calc-btn-inv', 'btn_inv', e)}
                            className={`py-1 rounded-lg border transition-all cursor-pointer ${
                              calcInvMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                          >
                            INV
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('MC', 'elem-calc-btn-mc', 'btn_mc', e)}
                            className="py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 cursor-pointer"
                          >
                            MC
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('MR', 'elem-calc-btn-mr', 'btn_mr', e)}
                            className="py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 cursor-pointer"
                          >
                            MR
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('M+', 'elem-calc-btn-m-plus', 'btn_m_plus', e)}
                            className="py-1 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 rounded-lg border border-slate-800 cursor-pointer"
                          >
                            M+
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('M-', 'elem-calc-btn-m-minus', 'btn_m_minus', e)}
                            className="py-1 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 rounded-lg border border-slate-800 cursor-pointer"
                          >
                            M-
                          </button>
                        </div>

                        {/* Scientific Functions Grid (Rendered when on Scientific tab) */}
                        {activeTab === 'scientific' && (
                          <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-900/90 rounded-2xl border border-slate-800/80 animate-in fade-in duration-200 text-xs font-mono font-bold">
                            <button
                              onClick={(e) => handleCalcButtonClick(calcInvMode ? 'asin(' : 'sin(', 'elem-calc-btn-sin', 'btn_sin', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              {calcInvMode ? 'sin⁻¹' : 'sin'}
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick(calcInvMode ? 'acos(' : 'cos(', 'elem-calc-btn-cos', 'btn_cos', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              {calcInvMode ? 'cos⁻¹' : 'cos'}
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick(calcInvMode ? 'atan(' : 'tan(', 'elem-calc-btn-tan', 'btn_tan', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              {calcInvMode ? 'tan⁻¹' : 'tan'}
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('ln(', 'elem-calc-btn-ln', 'btn_ln', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              ln
                            </button>

                            <button
                              onClick={(e) => handleCalcButtonClick('log(', 'elem-calc-btn-log', 'btn_log', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              log
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('√(', 'elem-calc-btn-sqrt', 'btn_sqrt', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              √
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('^', 'elem-calc-btn-power', 'btn_power', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              xʸ
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('π', 'elem-calc-btn-pi', 'btn_pi', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              π
                            </button>

                            <button
                              onClick={(e) => handleCalcButtonClick('e', 'elem-calc-btn-e', 'btn_e', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-cyan-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              e
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('(', 'elem-calc-btn-paren-open', 'btn_paren_open', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-amber-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              (
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick(')', 'elem-calc-btn-paren-close', 'btn_paren_close', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-amber-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              )
                            </button>
                            <button
                              onClick={(e) => handleCalcButtonClick('%', 'elem-calc-btn-percent', 'btn_percent', e)}
                              className="py-2 bg-slate-950 hover:bg-slate-800 text-indigo-300 rounded-xl border border-slate-800 cursor-pointer"
                            >
                              %
                            </button>
                          </div>
                        )}

                        {/* Primary Interactive Numeric Keypad */}
                        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                          {/* Row 1: Actions & Division */}
                          <button
                            onClick={(e) => handleCalcButtonClick('AC', 'elem-calc-btn-ac', 'btn_clear', e)}
                            className="py-3 bg-rose-950/80 hover:bg-rose-900/90 text-rose-300 rounded-2xl font-black text-xs border border-rose-800/80 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            AC
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('DEL', 'elem-calc-btn-del', 'btn_del', e)}
                            className="py-3 bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 rounded-2xl font-black text-xs border border-amber-800/80 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            DEL
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('%', 'elem-calc-btn-percent', 'btn_percent', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-indigo-300 rounded-2xl font-black text-xs border border-slate-800 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            %
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('÷', 'elem-calc-op-div', 'op_div', e)}
                            className="py-3 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 rounded-2xl font-black text-base border border-cyan-800/90 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            ÷
                          </button>

                          {/* Row 2: 7, 8, 9, × */}
                          <button
                            onClick={(e) => handleCalcButtonClick('7', 'elem-calc-digit-7', 'digit_7', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            7
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('8', 'elem-calc-digit-8', 'digit_8', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            8
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('9', 'elem-calc-digit-9', 'digit_9', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            9
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('×', 'elem-calc-op-mul', 'op_mul', e)}
                            className="py-3 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 rounded-2xl font-black text-base border border-cyan-800/90 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            ×
                          </button>

                          {/* Row 3: 4, 5, 6, - */}
                          <button
                            onClick={(e) => handleCalcButtonClick('4', 'elem-calc-digit-4', 'digit_4', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            4
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('5', 'elem-calc-digit-5', 'digit_5', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            5
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('6', 'elem-calc-digit-6', 'digit_6', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            6
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('-', 'elem-calc-op-sub', 'op_sub', e)}
                            className="py-3 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 rounded-2xl font-black text-base border border-cyan-800/90 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            -
                          </button>

                          {/* Row 4: 1, 2, 3, + */}
                          <button
                            onClick={(e) => handleCalcButtonClick('1', 'elem-calc-digit-1', 'digit_1', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            1
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('2', 'elem-calc-digit-2', 'digit_2', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            2
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('3', 'elem-calc-digit-3', 'digit_3', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            3
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('+', 'elem-calc-op-add', 'op_add', e)}
                            className="py-3 bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 rounded-2xl font-black text-base border border-cyan-800/90 shadow-md cursor-pointer transition-all active:scale-95"
                          >
                            +
                          </button>

                          {/* Row 5: 0, ., ±, = */}
                          <button
                            onClick={(e) => handleCalcButtonClick('0', 'elem-calc-digit-0', 'digit_0', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            0
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('.', 'elem-calc-btn-dot', 'btn_dot', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-base border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            .
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('±', 'elem-calc-btn-plus-minus', 'btn_plus_minus', e)}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-2xl font-black text-sm border border-slate-800 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            ±
                          </button>
                          <button
                            onClick={(e) => handleCalcButtonClick('=', 'elem-calc-btn-equals', 'btn_equals', e)}
                            className="py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 rounded-2xl font-black text-base shadow-lg shadow-cyan-500/30 cursor-pointer transition-all active:scale-95"
                          >
                            =
                          </button>
                        </div>
                      </div>
                    )}

                    {/* VIEW 2: UNIT & CURRENCY CONVERTER */}
                    {activeTab === 'converter' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        
                        {/* Category Pills */}
                        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[9px] font-bold">
                          {(['currency', 'length', 'weight', 'temp'] as const).map((cat) => (
                            <button
                              key={cat}
                              onClick={(e) => {
                                setCalcConvertCategory(cat);
                                if (cat === 'currency') { setCalcConvertFrom('USD'); setCalcConvertTo('EUR'); }
                                if (cat === 'length') { setCalcConvertFrom('m'); setCalcConvertTo('ft'); }
                                if (cat === 'weight') { setCalcConvertFrom('kg'); setCalcConvertTo('lb'); }
                                if (cat === 'temp') { setCalcConvertFrom('°C'); setCalcConvertTo('°F'); }
                                handleElementClick({
                                  id: `elem-calc-tab-${cat}`,
                                  name: `Converter ${cat} Mode`,
                                  type: 'android.widget.RadioButton',
                                  resourceId: `${pkg}:id/cat_${cat}`,
                                  xpath: `//android.widget.RadioButton[@resource-id="${pkg}:id/cat_${cat}"]`,
                                  bounds: '[0,0][0,0]',
                                  text: cat.toUpperCase(),
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className={`py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                                calcConvertCategory === cat 
                                  ? 'bg-cyan-600 text-white shadow-sm' 
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>

                        {/* Conversion Input Box */}
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">From Value</span>
                            <select
                              value={calcConvertFrom}
                              onChange={(e) => setCalcConvertFrom(e.target.value)}
                              className="bg-slate-950 text-cyan-300 font-mono font-bold text-xs px-2 py-1 rounded-lg border border-slate-800 outline-none cursor-pointer"
                            >
                              {calcConvertCategory === 'currency' && ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'length' && ['m', 'km', 'cm', 'mm', 'ft', 'in', 'mi'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'weight' && ['kg', 'g', 'mg', 'lb', 'oz'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'temp' && ['°C', '°F', 'K'].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>

                          <input
                            type="text"
                            value={calcConvertInput}
                            onChange={(e) => setCalcConvertInput(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono font-black text-base outline-none focus:border-cyan-500"
                            placeholder="0"
                          />
                        </div>

                        {/* Swap Button */}
                        <div className="flex justify-center -my-1">
                          <button
                            onClick={(e) => {
                              const temp = calcConvertFrom;
                              setCalcConvertFrom(calcConvertTo);
                              setCalcConvertTo(temp);
                              handleElementClick({
                                id: 'elem-calc-btn-swap',
                                name: 'Swap Conversion Units',
                                type: 'android.widget.ImageButton',
                                resourceId: `${pkg}:id/btn_swap_units`,
                                xpath: `//android.widget.ImageButton[@resource-id="${pkg}:id/btn_swap_units"]`,
                                bounds: '[0,0][0,0]',
                                clickable: true,
                                enabled: true
                              }, e);
                              toast.info(`Swapped: ${calcConvertTo} ⇄ ${calcConvertFrom}`);
                            }}
                            className="p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg border border-cyan-400/40 cursor-pointer active:scale-95 transition-all"
                            title="Swap Units"
                          >
                            <ArrowLeftRight size={14} />
                          </button>
                        </div>

                        {/* Conversion Output Box */}
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Converted Value</span>
                            <select
                              value={calcConvertTo}
                              onChange={(e) => setCalcConvertTo(e.target.value)}
                              className="bg-slate-950 text-emerald-300 font-mono font-bold text-xs px-2 py-1 rounded-lg border border-slate-800 outline-none cursor-pointer"
                            >
                              {calcConvertCategory === 'currency' && ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'length' && ['m', 'km', 'cm', 'mm', 'ft', 'in', 'mi'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'weight' && ['kg', 'g', 'mg', 'lb', 'oz'].map(u => <option key={u} value={u}>{u}</option>)}
                              {calcConvertCategory === 'temp' && ['°C', '°F', 'K'].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>

                          <div className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono font-black text-lg">
                            {calcConvertedResult} <span className="text-xs text-slate-400 font-normal">{calcConvertTo}</span>
                          </div>
                        </div>

                        {/* Quick Mini Pad for Converter */}
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          {['1','2','3','4','5','6','7','8','9','0','.','C'].map(k => (
                            <button
                              key={k}
                              onClick={(e) => {
                                if (k === 'C') {
                                  setCalcConvertInput('0');
                                } else if (k === '.') {
                                  if (!calcConvertInput.includes('.')) setCalcConvertInput(prev => prev + '.');
                                } else {
                                  setCalcConvertInput(prev => (prev === '0' ? k : prev + k));
                                }
                                handleElementClick({
                                  id: `elem-calc-conv-key-${k}`,
                                  name: `Keypad ${k}`,
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/key_${k}`,
                                  xpath: `//android.widget.Button[@text="${k}"]`,
                                  bounds: '[0,0][0,0]',
                                  text: k,
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold font-mono text-sm border border-slate-800 cursor-pointer"
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* VIEW 3: CALCULATION HISTORY LOG */}
                    {activeTab === 'history' && (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <History size={14} className="text-cyan-400" />
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">Past Calculations</h4>
                          </div>
                          <button
                            onClick={(e) => {
                              setCalcHistoryList([]);
                              toast.info('Calculation History Cleared');
                              handleElementClick({
                                id: 'elem-calc-btn-clear-history',
                                name: 'Clear History Log Button',
                                type: 'android.widget.Button',
                                resourceId: `${pkg}:id/btn_clear_history`,
                                xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_clear_history"]`,
                                bounds: '[0,0][0,0]',
                                clickable: true,
                                enabled: true
                              }, e);
                            }}
                            className="text-[10px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={11} /> Clear All
                          </button>
                        </div>

                        {calcHistoryList.length === 0 ? (
                          <div className="py-12 text-center text-slate-500 space-y-2">
                            <History size={32} className="mx-auto opacity-30 text-cyan-400" />
                            <p className="text-xs font-bold">No previous calculations recorded</p>
                            <p className="text-[10px] text-slate-600">Calculations you evaluate with '=' will appear here</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                            {calcHistoryList.map((hist, idx) => (
                              <div
                                key={hist.id || idx}
                                onClick={(e) => {
                                  setCalcDisplay(hist.expression);
                                  setCalcResult(hist.result);
                                  setActiveTab('standard');
                                  toast.success(`Loaded "${hist.expression}" from History!`);
                                  handleElementClick({
                                    id: `elem-calc-hist-item-${idx}`,
                                    name: `History Entry ${idx + 1}: ${hist.expression} = ${hist.result}`,
                                    type: 'android.widget.LinearLayout',
                                    resourceId: `${pkg}:id/history_item_${idx}`,
                                    xpath: `//android.widget.LinearLayout[@resource-id="${pkg}:id/history_item_${idx}"]`,
                                    bounds: '[0,0][0,0]',
                                    text: `${hist.expression} = ${hist.result}`,
                                    clickable: true,
                                    enabled: true
                                  }, e);
                                }}
                                className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer space-y-1 group"
                              >
                                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Clock size={10} className="text-cyan-400" /> {hist.timestamp}
                                  </span>
                                  <span className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                                    Click to Recall ↵
                                  </span>
                                </div>
                                <div className="text-xs font-mono font-medium text-slate-300 truncate">
                                  {hist.expression}
                                </div>
                                <div className="text-right text-sm font-mono font-black text-emerald-400">
                                  = {hist.result}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

                {/* 4. WEBDRIVERIO NATIVE DEMO APP INTERACTIVE SCREEN */}
                {appMeta.archetype === 'wdio' && (() => {
                  const currentCard = wdioSwipeCards[wdioSwipeCardIndex] || wdioSwipeCards[0];
                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                      {/* WDIO Top App Bar */}
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2.5">
                          <img 
                            src={WDIO_ASSETS.icon} 
                            alt="WDIO Logo" 
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-xl object-contain bg-slate-950 p-1 border border-slate-800"
                          />
                          <div>
                            <h4 className="text-xs font-black text-white tracking-wide">WEBDRIVER.IO</h4>
                            <p className="text-[10px] text-orange-400 font-mono">Demo Native App</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] px-2 py-0.5 rounded-lg font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            v1.0.8
                          </span>
                        </div>
                      </div>

                      {/* TAB 1: HOME */}
                      {activeTab === 'home' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Hero Mascot Robot Banner */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-wdio-home-hero') || currentElements[0], e);
                              toast.info("Inspected WebdriverIO Robot Mascot");
                            }}
                            className="p-4 bg-gradient-to-b from-orange-950/40 via-slate-900 to-slate-950 rounded-2xl border border-orange-500/30 text-center space-y-2 cursor-pointer shadow-lg group hover:border-orange-500/60 transition-all"
                          >
                            <div className="w-24 h-24 mx-auto relative flex items-center justify-center">
                              <img 
                                src={WDIO_ASSETS.robot_logo} 
                                alt="WDIO Robot" 
                                referrerPolicy="no-referrer"
                                className="w-20 h-20 object-contain drop-shadow-[0_0_15px_rgba(234,89,6,0.5)] group-hover:scale-110 transition-transform duration-300"
                              />
                            </div>
                            <h3 className="text-sm font-black text-white tracking-wider uppercase">
                              WEBDRIVER<span className="text-orange-500">.IO</span>
                            </h3>
                            <p className="text-[11px] text-slate-300 max-w-[240px] mx-auto leading-relaxed">
                              Demo app for the WebdriverIO native automation testing project.
                            </p>
                          </div>

                          {/* Quick Feature Chips */}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'OPENJS', desc: 'Foundation', bg: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
                              { label: 'APPIUM 2.0', desc: 'Automation', bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
                              { label: 'NATIVE', desc: 'Android & iOS', bg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' }
                            ].map((chip, i) => (
                              <div key={i} className={`p-2 rounded-xl border ${chip.bg}`}>
                                <div className="text-[10px] font-black">{chip.label}</div>
                                <div className="text-[8px] text-slate-400">{chip.desc}</div>
                              </div>
                            ))}
                          </div>

                          {/* Action Buttons */}
                          <div className="space-y-2 pt-1">
                            <button
                              onClick={(e) => {
                                setActiveTab('forms');
                                handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-forms') || currentElements[0], e);
                                toast.success("Navigated to Forms Screen");
                              }}
                              className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-orange-950/40 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                              Explore Form Components <ChevronRight size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                setActiveTab('swipe');
                                handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-swipe') || currentElements[0], e);
                                toast.success("Navigated to Swipe Carousel");
                              }}
                              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
                            >
                              Try Swipe Gestures <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 2: WEBVIEW */}
                      {activeTab === 'webview' && (
                        <div className="space-y-2.5 animate-in fade-in duration-200">
                          {/* Browser Address Bar */}
                          <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-2 text-xs">
                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                              <CheckCircle size={12} />
                            </div>
                            <span className="text-slate-300 font-mono text-[11px] truncate flex-1">https://webdriver.io</span>
                            <RotateCw size={12} className="text-slate-400 cursor-pointer hover:text-white" />
                          </div>

                          {/* Webview Content Body */}
                          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                            <div className="flex items-center gap-2">
                              <img src={WDIO_ASSETS.icon} alt="WDIO" className="w-6 h-6 object-contain" />
                              <span className="text-xs font-black text-white">WebdriverIO Official Docs</span>
                            </div>
                            <h3 className="text-sm font-black text-white leading-snug">
                              Next-gen browser and mobile automation test framework for Node.js
                            </h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              WebdriverIO is a progressive automation framework built to automate modern web and mobile applications.
                            </p>

                            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 font-mono text-[10px] text-emerald-400 space-y-1">
                              <div className="text-slate-500">// Example Test Script</div>
                              <div>await $('~button-login').click();</div>
                              <div>await $('~input-email').setValue('user@test.com');</div>
                              <div>expect(await $('~success-msg')).toBeDisplayed();</div>
                            </div>

                            <button
                              onClick={(e) => {
                                handleElementClick({
                                  id: 'elem-wdio-btn-docs-get-started',
                                  name: 'Webview Get Started Button',
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/btn_get_started`,
                                  accessibilityId: 'get started',
                                  xpath: `//android.widget.Button[@content-desc="get started"]`,
                                  bounds: '[0,0][0,0]',
                                  text: 'Get Started',
                                  clickable: true,
                                  enabled: true
                                }, e);
                                toast.success("Webview Get Started clicked!");
                              }}
                              className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer transition-all"
                            >
                              Get Started with WebdriverIO
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 3: LOGIN / SIGN UP */}
                      {activeTab === 'login' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Segment Selector: Login vs Sign up */}
                          <div className="p-1 bg-slate-900 rounded-xl border border-slate-800 flex">
                            <button
                              onClick={(e) => {
                                setWdioLoginSegment('login');
                                handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-login-container') || currentElements[0], e);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                wdioLoginSegment === 'login' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Login
                            </button>
                            <button
                              onClick={(e) => {
                                setWdioLoginSegment('signup');
                                handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-sign-up-container') || currentElements[0], e);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                wdioLoginSegment === 'signup' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Sign up
                            </button>
                          </div>

                          {/* Login / Sign up Form Fields */}
                          <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-2.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</label>
                              <div className="relative">
                                <input
                                  type="email"
                                  value={wdioLoginEmail}
                                  onChange={(e) => setWdioLoginEmail(e.target.value)}
                                  placeholder="user@example.com"
                                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-bold"
                                />
                                <Mail size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
                              <div className="relative">
                                <input
                                  type="password"
                                  value={wdioLoginPassword}
                                  onChange={(e) => setWdioLoginPassword(e.target.value)}
                                  placeholder="Enter password"
                                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-bold"
                                />
                                <Lock size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                              </div>
                            </div>

                            {wdioLoginSegment === 'signup' && (
                              <div className="space-y-1 animate-in fade-in duration-200">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repeat Password</label>
                                <div className="relative">
                                  <input
                                    type="password"
                                    value={wdioRepeatPassword}
                                    onChange={(e) => setWdioRepeatPassword(e.target.value)}
                                    placeholder="Repeat password"
                                    className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-bold"
                                  />
                                  <Lock size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                                </div>
                              </div>
                            )}

                            {/* Biometric Toggle */}
                            <div 
                              onClick={() => setWdioBiometricEnabled(!wdioBiometricEnabled)}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-orange-400" />
                                <span className="text-[11px] text-slate-300 font-bold">Biometric Authentication</span>
                              </div>
                              <div className={`w-8 h-4 rounded-full transition-colors relative ${wdioBiometricEnabled ? 'bg-orange-500' : 'bg-slate-700'}`}>
                                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${wdioBiometricEnabled ? 'right-0.5' : 'left-0.5'}`} />
                              </div>
                            </div>

                            {/* Submit Button */}
                            <button
                              onClick={(e) => {
                                setWdioActiveDialog({
                                  title: wdioLoginSegment === 'login' ? 'Success' : 'Signed Up!',
                                  message: wdioLoginSegment === 'login' ? 'You are successfully logged in!' : 'Your account has been created!'
                                });
                                handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-submit-login') || currentElements[0], e);
                                toast.success(wdioLoginSegment === 'login' ? "Logged in successfully!" : "Account created successfully!");
                              }}
                              className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-orange-950/40 cursor-pointer transition-all active:scale-95"
                            >
                              {wdioLoginSegment === 'login' ? 'LOGIN' : 'SIGN UP'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 4: FORMS */}
                      {activeTab === 'forms' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">Form components</h4>
                            
                            {/* Type Something Input */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Input field:</label>
                              <input
                                type="text"
                                value={wdioFormInputText}
                                onChange={(e) => setWdioFormInputText(e.target.value)}
                                placeholder="Type something"
                                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 font-bold"
                              />
                            </div>

                            {/* Live Result Echo */}
                            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] space-y-0.5">
                              <span className="text-slate-500 font-bold block text-[9px] uppercase">You have typed:</span>
                              <span className="text-orange-400 font-mono font-bold">{wdioFormInputText || '(none)'}</span>
                            </div>

                            {/* Switch & State Label */}
                            <div className="space-y-1 pt-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Switch:</label>
                              <div 
                                onClick={(e) => {
                                  setWdioFormSwitch(!wdioFormSwitch);
                                  handleElementClick(currentElements.find(el => el.id === 'elem-wdio-form-switch') || currentElements[0], e);
                                }}
                                className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between cursor-pointer"
                              >
                                <span className="text-[11px] text-slate-300 font-bold">
                                  {wdioFormSwitch ? 'Click to turn the switch OFF' : 'Click to turn the switch ON'}
                                </span>
                                <div className={`w-9 h-5 rounded-full transition-colors relative ${wdioFormSwitch ? 'bg-orange-500' : 'bg-slate-700'}`}>
                                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${wdioFormSwitch ? 'right-0.5' : 'left-0.5'}`} />
                                </div>
                              </div>
                            </div>

                            {/* Dropdown Picker */}
                            <div className="space-y-1 pt-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Dropdown Picker:</label>
                              <select
                                value={wdioFormDropdownValue}
                                onChange={(e) => {
                                  setWdioFormDropdownValue(e.target.value);
                                  toast.info(`Selected "${e.target.value}"`);
                                }}
                                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500 font-bold cursor-pointer"
                              >
                                <option value="webdriver.io is awesome">webdriver.io is awesome</option>
                                <option value="Appium is great">Appium is great</option>
                                <option value="This app is awesome">This app is awesome</option>
                              </select>
                            </div>

                            {/* Active & Inactive Buttons */}
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <button
                                onClick={(e) => {
                                  setWdioActiveDialog({
                                    title: 'This button is',
                                    message: 'This button is active'
                                  });
                                  handleElementClick(currentElements.find(el => el.id === 'elem-wdio-btn-active') || currentElements[0], e);
                                  toast.success("Active button clicked!");
                                }}
                                className="py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow transition-all active:scale-95"
                              >
                                Active
                              </button>
                              <button
                                disabled
                                className="py-2.5 bg-slate-800 text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider cursor-not-allowed border border-slate-700/50"
                              >
                                Inactive
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* TAB 5: SWIPE */}
                      {activeTab === 'swipe' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="text-center space-y-0.5">
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">Swipe horizontal</h4>
                            <p className="text-[10px] text-slate-400">Or use next/previous buttons to slide cards</p>
                          </div>

                          {/* Swipe Card Item View */}
                          <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-orange-500/30 text-center space-y-2 shadow-xl relative overflow-hidden min-h-[160px] flex flex-col justify-center items-center">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                              {currentCard.badge} • #{wdioSwipeCardIndex + 1} OF {wdioSwipeCards.length}
                            </span>
                            <h3 className="text-sm font-black text-white tracking-wide">
                              {currentCard.title}
                            </h3>
                            <p className="text-[11px] text-slate-300 max-w-[220px] leading-relaxed">
                              {currentCard.desc}
                            </p>
                          </div>

                          {/* Carousel Controls */}
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={(e) => {
                                setWdioSwipeCardIndex(prev => Math.max(0, prev - 1));
                                handleElementClick({
                                  id: 'elem-wdio-btn-swipe-prev',
                                  name: 'Swipe Carousel Previous Button',
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/btn_prev`,
                                  xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_prev"]`,
                                  bounds: '[0,0][0,0]',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              disabled={wdioSwipeCardIndex === 0}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white rounded-xl text-xs font-bold border border-slate-800 cursor-pointer flex items-center gap-1"
                            >
                              <ArrowLeft size={13} /> Prev
                            </button>

                            {/* Card Dots Indicator */}
                            <div className="flex items-center gap-1.5">
                              {wdioSwipeCards.map((_, i) => (
                                <div
                                  key={i}
                                  onClick={() => setWdioSwipeCardIndex(i)}
                                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                    i === wdioSwipeCardIndex ? 'w-5 bg-orange-500' : 'w-1.5 bg-slate-700'
                                  }`}
                                />
                              ))}
                            </div>

                            <button
                              onClick={(e) => {
                                setWdioSwipeCardIndex(prev => {
                                  const next = Math.min(wdioSwipeCards.length - 1, prev + 1);
                                  if (next === wdioSwipeCards.length - 1) setWdioFoundSecret(true);
                                  return next;
                                });
                                handleElementClick({
                                  id: 'elem-wdio-btn-swipe-next',
                                  name: 'Swipe Carousel Next Button',
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/btn_next`,
                                  xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_next"]`,
                                  bounds: '[0,0][0,0]',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              disabled={wdioSwipeCardIndex === wdioSwipeCards.length - 1}
                              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1"
                            >
                              Next <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* Secret easter egg robot banner */}
                          {wdioFoundSecret && (
                            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-center space-y-1 animate-in zoom-in-95 duration-300">
                              <span className="text-[10px] font-black text-emerald-400">🎉 SECRET BOT DISCOVERED!</span>
                              <p className="text-[10px] text-slate-300">You reached the end of the WebdriverIO swipe cards!</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 6: DRAG AND DROP PUZZLE */}
                      {activeTab === 'drag' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="text-center space-y-0.5">
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">Drag and Drop Puzzle</h4>
                            <p className="text-[10px] text-slate-400">Tap tiles to place them into the 3x3 robot grid</p>
                          </div>

                          {/* 3x3 Grid Target Area */}
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800">
                            <div className="grid grid-cols-3 gap-2 aspect-square max-w-[200px] mx-auto">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tileId) => {
                                const isPlaced = wdioDragPlaced[tileId];
                                return (
                                  <div
                                    key={tileId}
                                    onClick={() => {
                                      setWdioDragPlaced(prev => ({ ...prev, [tileId]: !prev[tileId] }));
                                    }}
                                    className={`rounded-xl border flex items-center justify-center font-black text-xs transition-all cursor-pointer ${
                                      isPlaced 
                                        ? 'bg-orange-600 text-white border-orange-400 shadow-md scale-95' 
                                        : 'bg-slate-950 text-slate-600 border-slate-800 border-dashed hover:border-slate-600'
                                    }`}
                                  >
                                    {isPlaced ? `#${tileId}` : `[ ${tileId} ]`}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Tile Action Controls */}
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => {
                                setWdioDragPlaced({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true });
                                toast.success("Puzzle Solved!");
                              }}
                              className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
                            >
                              Auto-Solve Puzzle
                            </button>
                            <button
                              onClick={() => {
                                setWdioDragPlaced({});
                                toast.info("Puzzle Reset");
                              }}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 cursor-pointer"
                            >
                              <RotateCcw size={13} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Modal Dialog for Active Button & Form Actions */}
                      {wdioActiveDialog && (
                        <div className="p-3.5 bg-slate-900 rounded-2xl border border-orange-500/50 shadow-2xl space-y-2 animate-in zoom-in-95 duration-200">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-black text-white">{wdioActiveDialog.title}</h5>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono">ALERT</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {wdioActiveDialog.message}
                          </p>
                          <button
                            onClick={() => setWdioActiveDialog(null)}
                            className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. HEALTH INSURANCE (NIVA BUPA CARE) NATIVE INTERACTIVE APPLICATION SCREEN */}
                {appMeta.archetype === 'health_insurance' && (() => {
                  const apkAssets = getApkAssets(pkg, mobileApkName);
                  const themeColor = '#0D9488';
                  const appTitle = apkAssets?.appName || appMeta.displayName || 'Niva Bupa Health Insurance';
                  const allImgs = apkAssets?.allImages || [];
                  const heroImg = apkAssets?.bannerImage || allImgs[0]?.dataUrl || null;
                  const hospitalsList = [
                    { id: 'hosp-1', name: 'Max Super Speciality Hospital', area: 'Saket, New Delhi', distance: '1.2 km', rating: 4.9, cashless: true, beds: '24 ICUs Available' },
                    { id: 'hosp-2', name: 'Fortis Escorts Heart Institute', area: 'Okhla, New Delhi', distance: '3.4 km', rating: 4.8, cashless: true, beds: '18 ICUs Available' },
                    { id: 'hosp-3', name: 'Apollo Multi-Speciality Indraprastha', area: 'Sarita Vihar, New Delhi', distance: '5.1 km', rating: 4.7, cashless: true, beds: '30 ICUs Available' },
                    { id: 'hosp-4', name: 'Medanta - The Medicity', area: 'Sector 38, Gurugram', distance: '12.5 km', rating: 4.9, cashless: true, beds: '45 ICUs Available' }
                  ].filter(h => {
                    const matchesSearch = !nivaSearchHospital.trim() || h.name.toLowerCase().includes(nivaSearchHospital.toLowerCase()) || h.area.toLowerCase().includes(nivaSearchHospital.toLowerCase());
                    const matchesCashless = !nivaCashlessOnly || h.cashless;
                    return matchesSearch && matchesCashless;
                  });

                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                      {/* App Header Banner */}
                      <div className="p-3 rounded-2xl border border-teal-500/30 bg-teal-950/40 flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2.5">
                          {apkAssets?.appIcon ? (
                            <img 
                              src={apkAssets.appIcon} 
                              alt="App Icon" 
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-xl object-contain drop-shadow bg-slate-950 p-1 border border-teal-500/40 shrink-0" 
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                              <Shield size={18} />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-black text-teal-100 truncate">{appTitle}</h4>
                            <p className="text-[10px] text-teal-400 font-mono truncate">Policy: {nivaClaimPolicyNo}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-call-emergency') || currentElements[0], e);
                              toast.info("Connecting to 24x7 Niva Bupa Cashless Helpline: 1800-200-1111");
                            }}
                            className="px-2.5 py-1 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-600/30 cursor-pointer transition-all"
                          >
                            <PhoneCall size={11} /> 24x7 SOS
                          </button>
                          <span className="text-[9px] px-2 py-1 rounded-lg font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            CASHLESS
                          </span>
                        </div>
                      </div>

                      {/* TAB 1: POLICY HUB / DASHBOARD */}
                      {(activeTab === 'dashboard' || !activeTab) && (
                        <div className="space-y-3">
                          {/* Active Policy Card */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-hero-policy-card') || currentElements[0], e);
                              toast.info("Inspected Active Policy: ReAssure 2.0 Titanium");
                            }}
                            className="p-4 rounded-2xl bg-gradient-to-br from-teal-900 via-teal-950 to-slate-950 border border-teal-500/40 relative overflow-hidden shadow-lg cursor-pointer hover:border-teal-400 transition-all group"
                          >
                            <div className="relative z-10 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                  REASSURE 2.0 TITANIUM
                                </span>
                                <span className="text-[10px] font-bold text-teal-400 font-mono">ACTIVE COVER</span>
                              </div>
                              <div className="space-y-0.5">
                                <h3 className="text-xl font-black text-white">₹10,00,000</h3>
                                <p className="text-[11px] text-teal-200">Alex Johnson • Policy: {nivaClaimPolicyNo}</p>
                              </div>
                              <div className="pt-2 border-t border-teal-500/20 flex items-center justify-between text-[10px] text-teal-300">
                                <span>No Claim Bonus: <strong>₹2,50,000 (25%)</strong></span>
                                <span className="text-emerald-400 font-bold">● Cashless Active</span>
                              </div>
                            </div>
                            {heroImg && (
                              <img 
                                src={heroImg} 
                                alt="Policy Banner" 
                                referrerPolicy="no-referrer" 
                                className="absolute -right-4 -bottom-4 w-28 h-28 object-contain opacity-20 group-hover:scale-110 transition-transform" 
                              />
                            )}
                          </div>

                          {/* Pre-Auth Active Status Card */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-claim-status-badge') || currentElements[0], e);
                              toast.success("Pre-Authorization Approved for ₹45,000 at Max Super Speciality");
                            }}
                            className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/30 flex items-center justify-between cursor-pointer hover:border-emerald-400 transition-all"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                <CheckCircle2 size={16} />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-white">Pre-Auth Claim Approved</h5>
                                <p className="text-[10px] text-slate-400">Max Super Speciality • ₹45,000 Covered</p>
                              </div>
                            </div>
                            <span className="text-[9px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                              30-MIN SLA
                            </span>
                          </div>

                          {/* Quick Action Grid */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-intimate-claim') || currentElements[0], e);
                                setActiveTab('claims');
                                toast.info("Opened Cashless Claims Form");
                              }}
                              className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-teal-500/50 flex flex-col gap-1.5 text-left cursor-pointer transition-all group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <FileText size={14} />
                              </div>
                              <span className="text-xs font-bold text-white">File Cashless Claim</span>
                              <span className="text-[9px] text-slate-400">Direct hospital intimation</span>
                            </button>

                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-find-hospitals') || currentElements[0], e);
                                setActiveTab('hospitals');
                                toast.info("Opened Network Hospitals Finder");
                              }}
                              className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-teal-500/50 flex flex-col gap-1.5 text-left cursor-pointer transition-all group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <MapPin size={14} />
                              </div>
                              <span className="text-xs font-bold text-white">Find Hospitals</span>
                              <span className="text-[9px] text-slate-400">10,400+ cashless centers</span>
                            </button>

                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-teleconsult') || currentElements[0], e);
                                toast.success("Connected to 24x7 Doctor Teleconsultation Queue");
                              }}
                              className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-teal-500/50 flex flex-col gap-1.5 text-left cursor-pointer transition-all group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Activity size={14} />
                              </div>
                              <span className="text-xs font-bold text-white">Doctor Consult</span>
                              <span className="text-[9px] text-slate-400">Free video call in 5 mins</span>
                            </button>

                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-renew-policy') || currentElements[0], e);
                                toast.info("Policy renew window active. Premium: ₹14,200/yr");
                              }}
                              className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-teal-500/50 flex flex-col gap-1.5 text-left cursor-pointer transition-all group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Zap size={14} />
                              </div>
                              <span className="text-xs font-bold text-white">Renew Policy</span>
                              <span className="text-[9px] text-slate-400">Save 10% with Health Points</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 2: CASHLESS CLAIMS INTIMATION */}
                      {activeTab === 'claims' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Claim Mode Selector */}
                          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
                            <button
                              onClick={(e) => {
                                setNivaClaimType('cashless');
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-claim-cashless') || currentElements[0], e);
                              }}
                              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                nivaClaimType === 'cashless'
                                  ? 'bg-teal-600 text-white shadow-md'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Cashless Pre-Auth
                            </button>
                            <button
                              onClick={() => setNivaClaimType('reimbursement')}
                              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                nivaClaimType === 'reimbursement'
                                  ? 'bg-teal-600 text-white shadow-md'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Reimbursement
                            </button>
                          </div>

                          {/* Claim Form Fields */}
                          <div className="space-y-2">
                            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">POLICY NUMBER</span>
                              <input 
                                type="text"
                                value={nivaClaimPolicyNo}
                                onChange={(e) => setNivaClaimPolicyNo(e.target.value)}
                                className="bg-transparent text-xs text-white focus:outline-none w-full font-mono font-bold"
                              />
                            </div>

                            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">HOSPITAL NAME</span>
                              <input 
                                type="text"
                                value={nivaClaimHospital}
                                onChange={(e) => setNivaClaimHospital(e.target.value)}
                                className="bg-transparent text-xs text-white focus:outline-none w-full font-bold"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">CLAIM AMOUNT (₹)</span>
                                <input 
                                  type="text"
                                  value={nivaClaimAmount}
                                  onChange={(e) => setNivaClaimAmount(e.target.value)}
                                  className="bg-transparent text-xs text-white focus:outline-none w-full font-bold font-mono"
                                />
                              </div>
                              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">DATE OF ADMISSION</span>
                                <input 
                                  type="text"
                                  value={nivaClaimDate}
                                  onChange={(e) => setNivaClaimDate(e.target.value)}
                                  className="bg-transparent text-xs text-white focus:outline-none w-full font-mono font-bold"
                                />
                              </div>
                            </div>

                            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">DIAGNOSIS / AILMENT</span>
                              <input 
                                type="text"
                                value={nivaClaimDiagnosis}
                                onChange={(e) => setNivaClaimDiagnosis(e.target.value)}
                                className="bg-transparent text-xs text-white focus:outline-none w-full font-bold"
                              />
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              const newClaim = {
                                id: `CLM-${Math.floor(10000 + Math.random() * 90000)}`,
                                hospital: nivaClaimHospital,
                                amount: `₹${nivaClaimAmount}`,
                                status: 'Pre-Auth Under Review',
                                date: 'Just now'
                              };
                              setNivaSubmittedClaims(prev => [newClaim, ...prev]);
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-submit-claim') || currentElements[0], e);
                              toast.success(`Claim ${newClaim.id} Submitted for ${nivaClaimHospital}! (30-Min SLA)`);
                            }}
                            className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Check size={14} /> Submit Cashless Intimation (30 Min SLA)
                          </button>

                          {/* Recent Claims List */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ACTIVE INTIMATIONS</span>
                            {nivaSubmittedClaims.map((clm) => (
                              <div key={clm.id} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                                <div>
                                  <div className="font-bold text-white">{clm.hospital}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{clm.id} • {clm.date}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-emerald-400 font-mono">{clm.amount}</div>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold">{clm.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TAB 3: NETWORK HOSPITALS FINDER */}
                      {activeTab === 'hospitals' && (
                        <div className="space-y-2.5 animate-in fade-in duration-200">
                          <div className="relative">
                            <input 
                              type="text"
                              value={nivaSearchHospital}
                              onChange={(e) => setNivaSearchHospital(e.target.value)}
                              placeholder="Search hospitals by name, city, or pincode..."
                              className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                            />
                            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          </div>

                          <div 
                            onClick={(e) => {
                              setNivaCashlessOnly(!nivaCashlessOnly);
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-filter-cashless-toggle') || currentElements[0], e);
                            }}
                            className="flex items-center justify-between p-2.5 bg-slate-900 rounded-xl border border-slate-800 cursor-pointer"
                          >
                            <span className="text-xs text-slate-300 font-bold">Only Cashless Desk Active</span>
                            <input 
                              type="checkbox"
                              checked={nivaCashlessOnly}
                              onChange={() => {}}
                              className="rounded bg-slate-950 border-slate-700 text-teal-600 focus:ring-0 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-2">
                            {hospitalsList.map((hosp, idx) => (
                              <div
                                key={hosp.id}
                                onClick={(e) => {
                                  handleElementClick(currentElements.find(el => el.id === (idx === 0 ? 'elem-niva-hospital-max' : idx === 1 ? 'elem-niva-hospital-fortis' : 'elem-niva-hospital-apollo')) || currentElements[0], e);
                                  toast.info(`Selected ${hosp.name}`);
                                }}
                                className="p-3 bg-slate-900 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-teal-500/40 transition-all cursor-pointer space-y-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-white">{hosp.name}</h4>
                                  <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                    <Star size={10} className="fill-amber-400" /> {hosp.rating}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <MapPin size={10} className="text-teal-400 shrink-0" /> {hosp.area} • <strong className="text-slate-200">{hosp.distance}</strong>
                                </p>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                                  <span className="text-emerald-400 font-bold">✓ Cashless Desk Active</span>
                                  <span className="text-slate-400">{hosp.beds}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TAB 4: HEALTH SCORE & VITALS */}
                      {activeTab === 'vitals' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Step Activity Tracker */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-steps-counter') || currentElements[0], e);
                              setNivaStepCount(prev => prev + 500);
                              toast.success("Logged +500 steps! Total: " + (nivaStepCount + 500));
                            }}
                            className="p-4 rounded-2xl bg-gradient-to-br from-teal-950 to-slate-900 border border-teal-500/30 space-y-2 cursor-pointer hover:border-teal-400 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-teal-300">Daily Steps Activity</span>
                              <span className="text-[10px] text-emerald-400 font-bold">+500 Tap to log</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-black text-white font-mono">{nivaStepCount.toLocaleString()}</span>
                              <span className="text-xs text-slate-400 font-mono">/ 10,000 steps</span>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (nivaStepCount / 10000) * 100)}%` }}></div>
                            </div>
                          </div>

                          {/* Vitals Grid */}
                          <div className="grid grid-cols-2 gap-2">
                            <div 
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-vitals-bp') || currentElements[0], e);
                                toast.info("Blood Pressure: 120/80 mmHg (Optimal)");
                              }}
                              className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1 cursor-pointer hover:border-teal-500/40 transition-all"
                            >
                              <span className="text-[9px] font-bold text-slate-400 uppercase">BLOOD PRESSURE</span>
                              <h4 className="text-sm font-black text-white font-mono">120/80</h4>
                              <span className="text-[9px] text-emerald-400 font-bold">● Optimal Range</span>
                            </div>

                            <div 
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-niva-vitals-pulse') || currentElements[0], e);
                                toast.info("Resting Heart Rate: 72 bpm (Normal)");
                              }}
                              className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1 cursor-pointer hover:border-teal-500/40 transition-all"
                            >
                              <span className="text-[9px] font-bold text-slate-400 uppercase">HEART RATE</span>
                              <h4 className="text-sm font-black text-white font-mono">72 BPM</h4>
                              <span className="text-[9px] text-teal-400 font-bold">● Resting Normal</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-sync-fitbit') || currentElements[0], e);
                              toast.success("Synced with Google Fit / Health Connect! Health Score: 92/100");
                            }}
                            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-teal-500/30 text-teal-300 font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Activity size={13} /> Sync Google Fit & Health Connect
                          </button>
                        </div>
                      )}

                      {/* TAB 5: DIGITAL HEALTH CARD */}
                      {activeTab === 'card' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-digital-card-view') || currentElements[0], e);
                              toast.success("Digital Health e-Card verified & ready for Cashless Hospital Desk!");
                            }}
                            className="p-4 rounded-3xl bg-gradient-to-tr from-teal-900 via-emerald-950 to-teal-800 border border-teal-400/40 text-white space-y-3 shadow-2xl cursor-pointer hover:border-teal-300 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Shield size={18} className="text-teal-300" />
                                <span className="font-black text-xs tracking-wider">NIVA BUPA HEALTH</span>
                              </div>
                              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-white/20 text-white">e-CARD</span>
                            </div>

                            <div className="space-y-0.5 pt-1">
                              <h3 className="text-sm font-black">Alex Johnson</h3>
                              <p className="text-[10px] text-teal-200 font-mono">Member ID: NB-2026-992014</p>
                              <p className="text-[10px] text-teal-200 font-mono">Policy No: {nivaClaimPolicyNo}</p>
                            </div>

                            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[10px]">
                              <span>Cover: <strong>₹10,00,000</strong></span>
                              <span className="font-mono">TPA: In-House Cashless</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-niva-btn-call-emergency') || currentElements[0], e);
                              toast.info("Helpline dialer: 1800-200-1111 (24x7)");
                            }}
                            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <PhoneCall size={14} /> Call 24x7 Emergency Helpline (1800-200-1111)
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 6. MACHAXI SPORTS & ARENAS NATIVE INTERACTIVE APPLICATION SCREEN */}
                {appMeta.archetype === 'machaxi' && (() => {
                  const apkAssets = getApkAssets(pkg, mobileApkName);
                  const themeColor = '#4F46E5';
                  const appTitle = apkAssets?.appName || appMeta.displayName || 'Machaxi Sports Arena';

                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                      <div className="p-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                            <Activity size={18} />
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-black text-indigo-100 truncate">{appTitle}</h4>
                            <p className="text-[10px] text-indigo-400 font-mono truncate">{machaxiSelectedVenue}</p>
                          </div>
                        </div>
                        <span className="text-[9px] px-2 py-1 rounded-lg font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          BWF COURTS
                        </span>
                      </div>

                      {/* Sport Selector Chips */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold">
                        {['badminton', 'pickleball', 'table-tennis', 'swimming'].map((sp) => (
                          <button
                            key={sp}
                            onClick={(e) => {
                              setMachaxiSelectedSport(sp);
                              handleElementClick(currentElements.find(el => el.id === (sp === 'badminton' ? 'elem-machaxi-btn-badminton' : 'elem-machaxi-btn-pickleball')) || currentElements[0], e);
                            }}
                            className={`px-3 py-1.5 rounded-xl border whitespace-nowrap cursor-pointer transition-all capitalize ${
                              machaxiSelectedSport === sp
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {sp.replace('-', ' ')}
                          </button>
                        ))}
                      </div>

                      {/* Arena Cards */}
                      <div className="space-y-2">
                        {[
                          { name: 'Machaxi Arena HSR Layout', courts: '8 BWF Synthetic Courts', rate: '₹450/hr', status: 'Available' },
                          { name: 'Machaxi Sports Indiranagar', courts: '6 Wooden Badminton Courts', rate: '₹550/hr', status: 'Few Slots Left' }
                        ].map((arena, idx) => (
                          <div
                            key={idx}
                            onClick={() => setMachaxiSelectedVenue(arena.name)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                              machaxiSelectedVenue === arena.name
                                ? 'bg-indigo-950/60 border-indigo-500'
                                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-white">{arena.name}</h4>
                              <span className="text-emerald-400 font-bold text-xs">{arena.rate}</span>
                            </div>
                            <p className="text-[10px] text-slate-400">{arena.courts}</p>
                          </div>
                        ))}
                      </div>

                      {/* Slot Booking Button */}
                      <button
                        onClick={(e) => {
                          setMachaxiCourtBooked(true);
                          handleElementClick(currentElements.find(el => el.id === 'elem-machaxi-btn-book-court') || currentElements[0], e);
                          toast.success(`Court slot booked at ${machaxiSelectedVenue} for ${machaxiSelectedSlot}!`);
                        }}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} /> Book Slot at {machaxiSelectedVenue.split(' ')[2] || 'Arena'} (₹450/hr)
                      </button>
                    </div>
                  );
                })()}

                {/* 7. SOUND RECORDER (DANIEL KIM) NATIVE INTERACTIVE APPLICATION SCREEN */}
                {appMeta.archetype === 'sound_recorder' && (() => {
                  const apkAssets = getApkAssets(pkg, mobileApkName);
                  const appTitle = apkAssets?.appName || appMeta.displayName || 'Sound Recorder';
                  const isRecTab = activeTab === 'record' || !activeTab;

                  return (
                    <div className="space-y-4 pt-1 animate-in fade-in duration-300">
                      {/* Top Red Status Header matching Daniel Kim Sound Recorder */}
                      <div className="p-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white flex items-center justify-between shadow-lg shadow-red-950/40 border border-red-400/30">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white backdrop-blur-xs">
                            <Mic size={16} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">{appTitle}</h4>
                            <span className="text-[9px] text-red-100 font-mono">v1.3.0 • High Quality Audio</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-black uppercase ${
                            soundRecIsRecording ? 'bg-white text-red-600 animate-pulse' : 'bg-red-950/40 text-red-100 border border-white/20'
                          }`}>
                            {soundRecIsRecording ? 'LIVE REC' : 'READY'}
                          </span>
                          <button 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-soundrec-overflow-menu') || currentElements[0], e);
                              toast.info("Sound Recorder Settings: 44.1kHz AAC Encoding, Stereo Mic");
                            }}
                            className="p-1 rounded-lg hover:bg-white/20 text-white cursor-pointer transition-all"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </div>

                      {/* TAB 1: RECORD SCREEN */}
                      {isRecTab && (
                        <div className="space-y-6 pt-2 text-center animate-in fade-in duration-200">
                          {/* Large Circular Chronometer Display */}
                          <div className="relative flex items-center justify-center py-4">
                            {/* Outer pulsing ring when recording */}
                            {soundRecIsRecording && (
                              <div className="absolute w-48 h-48 rounded-full border-2 border-red-500/40 animate-ping" />
                            )}
                            <div 
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-soundrec-chronometer') || currentElements[0], e);
                              }}
                              className={`w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer shadow-xl ${
                                soundRecIsRecording 
                                  ? 'border-4 border-red-500 bg-red-950/30 text-white shadow-red-500/20' 
                                  : 'border-2 border-red-400/80 bg-slate-900/60 text-slate-100'
                              }`}
                            >
                              <span className="text-4xl font-black font-mono tracking-wider drop-shadow-md">
                                {formatSoundRecTime(soundRecSeconds)}
                              </span>
                              {soundRecIsRecording && (
                                <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase mt-1 animate-pulse">
                                  ● RECORDING
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Recording Status Prompt */}
                          <div className="space-y-1">
                            <p 
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-soundrec-status-text') || currentElements[0], e);
                              }}
                              className="text-xs font-bold text-slate-200 cursor-pointer"
                            >
                              {soundRecIsRecording ? 'Recording..' : 'Tap the button to start recording'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {soundRecIsRecording ? 'Capturing audio stream • 192 kbps' : 'Stored in /storage/emulated/0/SoundRecorder'}
                            </p>
                          </div>

                          {/* Primary Action Button (FAB) */}
                          <div className="flex justify-center pt-2">
                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-soundrec-btn-record') || currentElements[0], e);
                                if (soundRecIsRecording) {
                                  // Stop recording and save
                                  setSoundRecIsRecording(false);
                                  const newId = `rec-${Date.now()}`;
                                  const formattedDuration = formatSoundRecTime(soundRecSeconds || 1);
                                  setSoundRecSavedList(prev => [
                                    {
                                      id: newId,
                                      name: `Voice Memo ${prev.length + 1}.mp4`,
                                      length: formattedDuration,
                                      size: `${((soundRecSeconds || 1) * 0.035).toFixed(1)} MB`,
                                      date: 'Just now'
                                    },
                                    ...prev
                                  ]);
                                  toast.success(`Recording stopped and saved! (${formattedDuration})`);
                                  setSoundRecSeconds(0);
                                } else {
                                  // Start recording
                                  setSoundRecSeconds(0);
                                  setSoundRecIsRecording(true);
                                  toast.info("Started audio recording...");
                                }
                              }}
                              className={`w-18 h-18 rounded-full flex items-center justify-center text-white shadow-2xl transition-all cursor-pointer transform hover:scale-105 active:scale-95 ${
                                soundRecIsRecording 
                                  ? 'bg-red-600 hover:bg-red-500 ring-4 ring-red-500/30' 
                                  : 'bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 ring-4 ring-red-500/20'
                              }`}
                            >
                              {soundRecIsRecording ? (
                                <Square size={26} className="fill-white" />
                              ) : (
                                <Mic size={30} />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 2: SAVED RECORDINGS SCREEN */}
                      {!isRecTab && (
                        <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              Audio Recordings ({soundRecSavedList.length})
                            </span>
                            <span className="text-[9px] text-red-400 font-mono font-bold">MPEG-4 AAC</span>
                          </div>

                          <div className="space-y-2.5">
                            {soundRecSavedList.map((rec) => {
                              const isPlaying = soundRecPlayingId === rec.id;
                              return (
                                <div
                                  key={rec.id}
                                  onClick={(e) => {
                                    handleElementClick(currentElements.find(el => el.id === `elem-soundrec-item-${rec.id}`) || currentElements[0], e);
                                  }}
                                  className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                                    isPlaying 
                                      ? 'bg-red-950/40 border-red-500/60 shadow-lg shadow-red-950/30' 
                                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleElementClick(currentElements.find(el => el.id === `elem-soundrec-play-${rec.id}`) || currentElements[0], e);
                                          if (isPlaying) {
                                            setSoundRecPlayingId(null);
                                            toast.info(`Paused ${rec.name}`);
                                          } else {
                                            setSoundRecPlayingId(rec.id);
                                            toast.success(`Playing ${rec.name}`);
                                          }
                                        }}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition-all cursor-pointer shrink-0 ${
                                          isPlaying ? 'bg-red-600 text-white' : 'bg-slate-800 hover:bg-red-600/80 text-red-300'
                                        }`}
                                      >
                                        {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                                      </button>
                                      <div>
                                        <h4 className="text-xs font-bold text-white truncate max-w-[170px]">{rec.name}</h4>
                                        <p className="text-[10px] text-slate-400 font-mono">{rec.date} • {rec.size}</p>
                                      </div>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-red-400">{rec.length}</span>
                                  </div>

                                  {/* Playing Waveform / Progress bar */}
                                  {isPlaying && (
                                    <div className="space-y-1 pt-1 border-t border-red-500/20">
                                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-red-500 h-full w-2/3 rounded-full animate-pulse" />
                                      </div>
                                      <div className="flex justify-between text-[8px] font-mono text-slate-400">
                                        <span>00:18</span>
                                        <span>{rec.length}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 8. APIDEMOS (IO.APPIUM.ANDROID.APIS) INTERACTIVE ANDROID APPLICATION */}
                {appMeta.archetype === 'apidemos' && (() => {
                  const currentLevel = apiDemosPath[apiDemosPath.length - 1];
                  const isTopLevel = apiDemosPath.length === 1;

                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                      {/* API Demos Android Action Bar Header */}
                      <div 
                        className="px-3 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-2xl flex items-center justify-between shadow-md border border-blue-600/40"
                      >
                        <div className="flex items-center gap-2">
                          {!isTopLevel && (
                            <button
                              onClick={(e) => {
                                setApiDemosPath(prev => prev.slice(0, prev.length - 1));
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-btn-back') || {
                                  id: 'elem-apidemos-btn-back',
                                  name: 'Navigate Up Button',
                                  type: 'android.widget.ImageButton',
                                  resourceId: 'android:id/home',
                                  accessibilityId: 'Navigate up',
                                  xpath: '//android.widget.ImageButton[@content-desc="Navigate up"]',
                                  bounds: '[0,0][0,0]',
                                  text: 'Back',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="p-1 rounded-lg bg-blue-900/50 hover:bg-blue-800 text-white cursor-pointer active:scale-95 transition-all"
                              title="Navigate Up"
                            >
                              <ArrowLeft size={16} />
                            </button>
                          )}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-actionbar') || currentElements[0], e);
                            }}
                            className="cursor-pointer"
                          >
                            <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">{currentLevel}</h4>
                            <span className="text-[8px] font-mono text-blue-200 block truncate max-w-[170px]">
                              io.appium.android.apis
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-black/20 text-white border border-white/20">
                            SDK SAMPLES
                          </span>
                        </div>
                      </div>

                      {/* Top Level Category List */}
                      {isTopLevel && (
                        <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                          <div className="px-2 py-1 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                            <span>SAMPLE CATEGORIES</span>
                            <span className="text-indigo-400 font-mono">11 MODULES</span>
                          </div>
                          {[
                            'Accessibility', 'Animation', 'App', 'Content', 'Graphics', 
                            'Media', 'NFC', 'OS', 'Preference', 'Text', 'Views'
                          ].map((cat) => {
                            const elem = currentElements.find(el => el.text === cat) || {
                              id: `elem-apidemos-item-${cat.toLowerCase()}`,
                              name: `Menu Item: ${cat}`,
                              type: 'android.widget.TextView',
                              resourceId: 'android:id/text1',
                              accessibilityId: cat,
                              xpath: `//android.widget.TextView[@text="${cat}"]`,
                              bounds: '[0,0][0,0]',
                              text: cat,
                              clickable: true,
                              enabled: true
                            };

                            return (
                              <div
                                key={cat}
                                onClick={(e) => {
                                  setApiDemosPath(prev => [...prev, cat]);
                                  handleElementClick(elem, e);
                                  toast.info(`Opened ${cat} demos`);
                                }}
                                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-800/80 hover:border-blue-500/50 flex items-center justify-between cursor-pointer transition-all group"
                              >
                                <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{cat}</span>
                                <ChevronRight size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Views Sub-Menu */}
                      {!isTopLevel && currentLevel === 'Views' && (
                        <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                          <div className="px-2 py-1 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                            <span>VIEWS & UI CONTROLS</span>
                            <span className="text-indigo-400 font-mono">11 SAMPLES</span>
                          </div>
                          {[
                            'Buttons', 'Controls', 'Date Widgets', 'Lists', 'Radio Group', 
                            'Rating Bar', 'Seek Bar', 'Spinner', 'Tabs', 'TextFields', 'Visibility'
                          ].map((sub) => {
                            const elem = currentElements.find(el => el.text === sub) || {
                              id: `elem-apidemos-sub-${sub.toLowerCase().replace(/ /g, '_')}`,
                              name: `View Option: ${sub}`,
                              type: 'android.widget.TextView',
                              resourceId: 'android:id/text1',
                              accessibilityId: sub,
                              xpath: `//android.widget.TextView[@text="${sub}"]`,
                              bounds: '[0,0][0,0]',
                              text: sub,
                              clickable: true,
                              enabled: true
                            };

                            return (
                              <div
                                key={sub}
                                onClick={(e) => {
                                  setApiDemosPath(prev => [...prev, sub]);
                                  handleElementClick(elem, e);
                                  toast.info(`Opened ${sub} controls`);
                                }}
                                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-800/80 hover:border-blue-500/50 flex items-center justify-between cursor-pointer transition-all group"
                              >
                                <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{sub}</span>
                                <ChevronRight size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Controls / Buttons / TextFields Interactive Workbench */}
                      {!isTopLevel && (currentLevel === 'Controls' || currentLevel === 'Buttons' || currentLevel === 'TextFields' || currentLevel === 'Rating Bar' || currentLevel === 'Seek Bar' || currentLevel === 'Spinner') && (
                        <div className="space-y-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
                          {/* 1. EditText Input */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase">Save Text (EditText):</label>
                            <input
                              type="text"
                              value={apiDemosEditText}
                              onChange={(e) => setApiDemosEditText(e.target.value)}
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-input-text') || currentElements[0], e);
                              }}
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                              placeholder="Type text here..."
                            />
                          </div>

                          {/* 2. Checkboxes */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div
                              onClick={(e) => {
                                setApiDemosCheckbox1(!apiDemosCheckbox1);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-checkbox-1') || currentElements[0], e);
                              }}
                              className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2 cursor-pointer hover:border-slate-700"
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${apiDemosCheckbox1 ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-900'}`}>
                                {apiDemosCheckbox1 && <Check size={12} />}
                              </div>
                              <span className="text-xs font-bold text-white">Checkbox 1</span>
                            </div>

                            <div
                              onClick={(e) => {
                                setApiDemosCheckbox2(!apiDemosCheckbox2);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-checkbox-2') || currentElements[0], e);
                              }}
                              className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2 cursor-pointer hover:border-slate-700"
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${apiDemosCheckbox2 ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-900'}`}>
                                {apiDemosCheckbox2 && <Check size={12} />}
                              </div>
                              <span className="text-xs font-bold text-white">Checkbox 2</span>
                            </div>
                          </div>

                          {/* 3. Toggle Button & Push Button */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                setApiDemosToggleBtn(!apiDemosToggleBtn);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-toggle-btn') || currentElements[0], e);
                                toast.info(`Toggle Button: ${!apiDemosToggleBtn ? 'ON' : 'OFF'}`);
                              }}
                              className={`py-2 px-3 rounded-xl text-xs font-black uppercase transition-all cursor-pointer shadow-md ${
                                apiDemosToggleBtn 
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400/40' 
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              Toggle: {apiDemosToggleBtn ? 'ON' : 'OFF'}
                            </button>

                            <button
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-btn-normal') || currentElements[0], e);
                                toast.success("Clicked Normal Button!");
                              }}
                              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 cursor-pointer active:scale-95 transition-all shadow"
                            >
                              Normal Button
                            </button>
                          </div>

                          {/* 4. Radio Group */}
                          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase block">Radio Group:</span>
                            <div className="flex items-center gap-4">
                              <div
                                onClick={(e) => {
                                  setApiDemosRadio('radio1');
                                  handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-radio-1') || currentElements[0], e);
                                }}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${apiDemosRadio === 'radio1' ? 'border-blue-500' : 'border-slate-700'}`}>
                                  {apiDemosRadio === 'radio1' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                </div>
                                <span className="text-xs font-bold text-slate-200">RadioButton 1</span>
                              </div>

                              <div
                                onClick={(e) => {
                                  setApiDemosRadio('radio2');
                                  handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-radio-2') || currentElements[0], e);
                                }}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${apiDemosRadio === 'radio2' ? 'border-blue-500' : 'border-slate-700'}`}>
                                  {apiDemosRadio === 'radio2' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                </div>
                                <span className="text-xs font-bold text-slate-200">RadioButton 2</span>
                              </div>
                            </div>
                          </div>

                          {/* 5. Rating Bar */}
                          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase">RatingBar (5 Stars):</span>
                              <span className="text-xs font-mono font-bold text-amber-400">{apiDemosRating} / 5.0</span>
                            </div>
                            <div className="flex items-center gap-2 py-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={(e) => {
                                    setApiDemosRating(star);
                                    handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-rating-bar') || currentElements[0], e);
                                    toast.info(`Set Rating: ${star} Stars`);
                                  }}
                                  className="cursor-pointer transition-transform hover:scale-125"
                                >
                                  <Star 
                                    size={20} 
                                    className={`${star <= apiDemosRating ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 6. SeekBar Slider */}
                          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase">SeekBar:</span>
                              <span className="text-xs font-mono font-bold text-blue-400">{apiDemosSeekBar}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={apiDemosSeekBar}
                              onChange={(e) => {
                                setApiDemosSeekBar(parseInt(e.target.value));
                              }}
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-seek-bar') || currentElements[0], e);
                              }}
                              className="w-full accent-blue-500 cursor-pointer"
                            />
                          </div>

                          {/* 7. Spinner Dropdown */}
                          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase block">Planet Spinner:</span>
                            <select
                              value={apiDemosSpinner}
                              onChange={(e) => {
                                setApiDemosSpinner(e.target.value);
                                toast.info(`Selected planet: ${e.target.value}`);
                              }}
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-spinner') || currentElements[0], e);
                              }}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
                            >
                              {['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* App Sub-Menu */}
                      {!isTopLevel && currentLevel === 'App' && (
                        <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                          <div className="px-2 py-1 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                            <span>APP DEMOS & SAMPLES</span>
                            <span className="text-indigo-400 font-mono">8 FEATURES</span>
                          </div>
                          {[
                            'Activity', 'Alarm', 'Alert Dialogs', 'Device Admin', 
                            'Fragment', 'Notification', 'Search', 'Voice Recognition'
                          ].map((sub) => {
                            const elem = currentElements.find(el => el.text === sub) || {
                              id: `elem-apidemos-app-${sub.toLowerCase().replace(/ /g, '_')}`,
                              name: `App Feature: ${sub}`,
                              type: 'android.widget.TextView',
                              resourceId: 'android:id/text1',
                              accessibilityId: sub,
                              xpath: `//android.widget.TextView[@text="${sub}"]`,
                              bounds: '[0,0][0,0]',
                              text: sub,
                              clickable: true,
                              enabled: true
                            };

                            return (
                              <div
                                key={sub}
                                onClick={(e) => {
                                  setApiDemosPath(prev => [...prev, sub]);
                                  handleElementClick(elem, e);
                                  toast.info(`Opened ${sub} demos`);
                                }}
                                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-800/80 hover:border-blue-500/50 flex items-center justify-between cursor-pointer transition-all group"
                              >
                                <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{sub}</span>
                                <ChevronRight size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Alert Dialogs Screen */}
                      {!isTopLevel && currentLevel === 'Alert Dialogs' && (
                        <div className="space-y-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-white">Alert Dialogs & Popups</h4>
                            <p className="text-[10px] text-slate-400">
                              Trigger native Android alert dialogs with custom buttons and handlers.
                            </p>
                          </div>

                          <div className="space-y-2 pt-2">
                            <button
                              onClick={(e) => {
                                setApiDemosDialogMsg("Lorem ipsum dolor sit ament, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");
                                setApiDemosShowDialog(true);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-btn-dialog-ok-cancel') || currentElements[0], e);
                              }}
                              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md active:scale-95"
                            >
                              OK Cancel Dialog with Message
                            </button>

                            <button
                              onClick={(e) => {
                                setApiDemosDialogMsg("Select an item from the native Android list dialog.");
                                setApiDemosShowDialog(true);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-btn-dialog-list') || currentElements[0], e);
                              }}
                              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-all shadow active:scale-95"
                            >
                              List dialog
                            </button>

                            <button
                              onClick={(e) => {
                                setApiDemosDialogMsg("Progress Bar indeterminate loading task...");
                                setApiDemosShowDialog(true);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apidemos-btn-dialog-progress') || currentElements[0], e);
                              }}
                              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 cursor-pointer transition-all shadow active:scale-95"
                            >
                              Progress Bar dialog
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Other Drill-down sub-items fallback */}
                      {!isTopLevel && currentLevel !== 'Views' && currentLevel !== 'Controls' && currentLevel !== 'Buttons' && currentLevel !== 'TextFields' && currentLevel !== 'Rating Bar' && currentLevel !== 'Seek Bar' && currentLevel !== 'Spinner' && currentLevel !== 'App' && currentLevel !== 'Alert Dialogs' && (
                        <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                          <div className="px-2 py-1 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                            <span>{currentLevel.toUpperCase()} DEMOS</span>
                            <span className="text-indigo-400 font-mono">ACTIVE</span>
                          </div>
                          {['Overview', 'Sample Implementation', 'Interactive Sandbox', 'Automation Testbench'].map((sub, idx) => (
                            <div
                              key={sub}
                              onClick={(e) => {
                                handleElementClick({
                                  id: `elem-apidemos-subitem-${idx}`,
                                  name: `${currentLevel} / ${sub}`,
                                  type: 'android.widget.TextView',
                                  resourceId: 'android:id/text1',
                                  accessibilityId: sub,
                                  xpath: `//android.widget.TextView[@text="${sub}"]`,
                                  bounds: '[0,0][0,0]',
                                  text: sub,
                                  clickable: true,
                                  enabled: true
                                }, e);
                                toast.info(`Inspected ${currentLevel} / ${sub}`);
                              }}
                              className="px-3 py-2.5 bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-800/80 hover:border-blue-500/50 flex items-center justify-between cursor-pointer transition-all group"
                            >
                              <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{sub}</span>
                              <ChevronRight size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Authentic Android Alert Dialog Popup Modal */}
                      {apiDemosShowDialog && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
                          <div className="w-full max-w-[260px] bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3">
                            <h3 className="text-sm font-black text-white">Alert Dialog</h3>
                            <p className="text-xs text-slate-300 leading-relaxed font-sans">{apiDemosDialogMsg}</p>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                              <button
                                onClick={(e) => {
                                  setApiDemosShowDialog(false);
                                  handleElementClick({
                                    id: 'elem-dialog-cancel',
                                    name: 'Alert Dialog Cancel Button',
                                    type: 'android.widget.Button',
                                    resourceId: 'android:id/button2',
                                    accessibilityId: 'Cancel',
                                    xpath: '//android.widget.Button[@resource-id="android:id/button2"]',
                                    bounds: '[0,0][0,0]',
                                    text: 'Cancel',
                                    clickable: true,
                                    enabled: true
                                  }, e);
                                  toast.info("Dialog Cancelled");
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={(e) => {
                                  setApiDemosShowDialog(false);
                                  handleElementClick({
                                    id: 'elem-dialog-ok',
                                    name: 'Alert Dialog OK Button',
                                    type: 'android.widget.Button',
                                    resourceId: 'android:id/button1',
                                    accessibilityId: 'OK',
                                    xpath: '//android.widget.Button[@resource-id="android:id/button1"]',
                                    bounds: '[0,0][0,0]',
                                    text: 'OK',
                                    clickable: true,
                                    enabled: true
                                  }, e);
                                  toast.success("Dialog Confirmed (OK)");
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-black bg-blue-600 text-white cursor-pointer shadow"
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 10. F-DROID OPEN SOURCE APP STORE INTERACTIVE ANDROID APPLICATION */}
                {appMeta.archetype === 'fdroid' && (() => {
                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                      {/* F-Droid App Header Toolbar */}
                      <div className="px-3 py-2.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-2xl flex items-center justify-between shadow-md border border-blue-600/40">
                        <div className="flex items-center gap-2">
                          {fdroidSelectedApp ? (
                            <button
                              onClick={(e) => {
                                setFdroidSelectedApp(null);
                                handleElementClick(currentElements.find(el => el.id === 'elem-fdroid-btn-back') || currentElements[0], e);
                              }}
                              className="p-1 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-white cursor-pointer active:scale-95 transition-all"
                            >
                              <ArrowLeft size={16} />
                            </button>
                          ) : (
                            <div className="w-7 h-7 rounded-xl bg-blue-950/80 border border-blue-400/40 flex items-center justify-center p-0.5 shadow-inner">
                              <Package size={15} className="text-blue-300" />
                            </div>
                          )}
                          <div
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-fdroid-toolbar') || currentElements[0], e);
                            }}
                            className="cursor-pointer"
                          >
                            <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">
                              {fdroidSelectedApp ? fdroidSelectedApp.name : (fdroidActiveTab === 'categories' ? 'Categories' : fdroidActiveTab === 'updates' ? 'Updates' : fdroidActiveTab === 'settings' ? 'Settings' : 'F-Droid')}
                            </h4>
                            <span className="text-[8px] font-mono text-blue-200 block truncate max-w-[150px]">
                              {pkg}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              toast.loading("Syncing F-Droid repositories...", { duration: 1200 });
                              handleElementClick(currentElements.find(el => el.id === 'elem-fdroid-btn-sync') || currentElements[0], e);
                            }}
                            className="p-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-blue-200 hover:text-white cursor-pointer transition-all active:scale-95"
                            title="Sync Repositories"
                          >
                            <RotateCw size={13} />
                          </button>
                          <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-black/30 text-emerald-300 border border-emerald-400/30">
                            FOSS
                          </span>
                        </div>
                      </div>

                      {/* Search Bar */}
                      {!fdroidSelectedApp && fdroidActiveTab !== 'settings' && (
                        <div className="relative">
                          <input
                            type="text"
                            value={fdroidSearchQuery}
                            onChange={(e) => setFdroidSearchQuery(e.target.value)}
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-fdroid-search-input') || currentElements[0], e);
                            }}
                            placeholder="Search apps, tools & utilities..."
                            className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                          />
                          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          {fdroidSearchQuery && (
                            <button
                              onClick={() => setFdroidSearchQuery('')}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white text-[10px] font-mono"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}

                      {/* Detail View of a Selected App */}
                      {fdroidSelectedApp ? (
                        <div className="space-y-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 animate-in fade-in duration-200">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${fdroidSelectedApp.iconBg} flex items-center justify-center text-white font-black text-base shadow-md border border-white/10`}>
                                {fdroidSelectedApp.name.charAt(0)}
                              </div>
                              <div>
                                <h3 className="text-sm font-black text-white">{fdroidSelectedApp.name}</h3>
                                <p className="text-[10px] text-blue-400 font-mono">{fdroidSelectedApp.id}</p>
                                <span className="text-[9px] text-slate-400">By {fdroidSelectedApp.author}</span>
                              </div>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {fdroidSelectedApp.license}
                            </span>
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800/80 text-center">
                            <div>
                              <span className="text-[8px] text-slate-500 block uppercase font-mono">Version</span>
                              <span className="text-[10px] font-bold text-slate-200">{fdroidSelectedApp.version}</span>
                            </div>
                            <div className="border-x border-slate-800">
                              <span className="text-[8px] text-slate-500 block uppercase font-mono">Size</span>
                              <span className="text-[10px] font-bold text-slate-200">{fdroidSelectedApp.size}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-slate-500 block uppercase font-mono">Rating</span>
                              <span className="text-[10px] font-bold text-amber-400">★ {fdroidSelectedApp.stars}</span>
                            </div>
                          </div>

                          {/* Action Button (Install / Open / Updating) */}
                          {(() => {
                            const isInstalled = fdroidInstalledApps[fdroidSelectedApp.id];
                            const isInstalling = (fdroidInstallingProgress[fdroidSelectedApp.id] || 0) > 0;
                            const progress = fdroidInstallingProgress[fdroidSelectedApp.id] || 0;

                            return (
                              <div className="space-y-1.5">
                                <button
                                  onClick={(e) => {
                                    const elem = currentElements.find(el => el.id === 'elem-fdroid-detail-btn-action') || currentElements[0];
                                    handleElementClick(elem, e);
                                    if (isInstalled) {
                                      toast.success(`Launched ${fdroidSelectedApp.name}!`);
                                    } else {
                                      toast.info(`Downloading ${fdroidSelectedApp.name} from F-Droid...`);
                                      setFdroidInstallingProgress(prev => ({ ...prev, [fdroidSelectedApp.id]: 30 }));
                                      setTimeout(() => {
                                        setFdroidInstallingProgress(prev => ({ ...prev, [fdroidSelectedApp.id]: 70 }));
                                      }, 400);
                                      setTimeout(() => {
                                        setFdroidInstallingProgress(prev => ({ ...prev, [fdroidSelectedApp.id]: 0 }));
                                        setFdroidInstalledApps(prev => ({ ...prev, [fdroidSelectedApp.id]: true }));
                                        toast.success(`Successfully installed ${fdroidSelectedApp.name}!`);
                                      }, 900);
                                    }
                                  }}
                                  className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95 ${
                                    isInstalled 
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                                  }`}
                                >
                                  {isInstalling ? (
                                    <>
                                      <RotateCw size={13} className="animate-spin" />
                                      <span>INSTALLING ({progress}%)...</span>
                                    </>
                                  ) : isInstalled ? (
                                    <>
                                      <CheckCircle size={13} />
                                      <span>OPEN APPLICATION</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download size={13} />
                                      <span>INSTALL ({fdroidSelectedApp.size})</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}

                          {/* App Description */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-fdroid-detail-desc') || currentElements[0], e);
                            }}
                            className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] text-slate-300 leading-relaxed cursor-pointer"
                          >
                            <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">About App</span>
                            <p>{fdroidSelectedApp.description}</p>
                          </div>
                        </div>
                      ) : (
                        /* TAB 1: LATEST & EXPLORE APPS */
                        fdroidActiveTab === 'latest' && (
                          <div className="space-y-2">
                            {/* Hero Featured App */}
                            <div 
                              onClick={(e) => {
                                setFdroidSelectedApp(fdroidAppList[0]);
                                handleElementClick(currentElements.find(el => el.id === `elem-fdroid-card-${fdroidAppList[0].id}`) || currentElements[0], e);
                              }}
                              className="p-3 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-blue-950/80 rounded-2xl border border-indigo-500/30 cursor-pointer hover:border-indigo-500/60 transition-all shadow-md group"
                            >
                              <div className="flex items-center justify-between text-[9px] font-black uppercase text-indigo-400 mb-1">
                                <span>FEATURED SPOTLIGHT</span>
                                <span className="text-emerald-400 font-mono">v0.27.0</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center text-white font-bold text-sm shadow">
                                  N
                                </div>
                                <div className="overflow-hidden">
                                  <h4 className="text-xs font-black text-white group-hover:text-indigo-300 transition-colors">NewPipe</h4>
                                  <p className="text-[10px] text-slate-300 line-clamp-1">Lightweight YouTube frontend with background playback</p>
                                </div>
                              </div>
                            </div>

                            {/* Section Header */}
                            <div className="flex items-center justify-between px-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              <span>WHAT'S NEW IN REPOSITORIES</span>
                              <span className="text-blue-400 font-mono">{displayedFdroidApps.length} APPS</span>
                            </div>

                            {/* App Cards List */}
                            <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5">
                              {displayedFdroidApps.map((app) => {
                                const isInstalled = fdroidInstalledApps[app.id];
                                return (
                                  <div
                                    key={app.id}
                                    onClick={(e) => {
                                      setFdroidSelectedApp(app);
                                      handleElementClick(currentElements.find(el => el.id === `elem-fdroid-card-${app.id}`) || currentElements[0], e);
                                    }}
                                    className="p-2.5 bg-slate-900/90 hover:bg-slate-850 rounded-2xl border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 cursor-pointer transition-all active:scale-[0.99] shadow-sm group"
                                  >
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${app.iconBg} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow`}>
                                        {app.name.charAt(0)}
                                      </div>
                                      <div className="overflow-hidden">
                                        <div className="flex items-center gap-1.5">
                                          <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors truncate">{app.name}</h4>
                                          {app.hasUpdate && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                          )}
                                        </div>
                                        <p className="text-[9px] text-slate-400 truncate">{app.summary}</p>
                                        <div className="flex items-center gap-2 text-[8px] font-mono text-slate-500 mt-0.5">
                                          <span>{app.version}</span>
                                          <span>•</span>
                                          <span>{app.size}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const elem = currentElements.find(el => el.id === `elem-fdroid-btn-${app.id}`) || currentElements[0];
                                        handleElementClick(elem, e);
                                        if (isInstalled) {
                                          toast.success(`Launched ${app.name}!`);
                                        } else {
                                          toast.info(`Installing ${app.name}...`);
                                          setFdroidInstalledApps(prev => ({ ...prev, [app.id]: true }));
                                          toast.success(`Installed ${app.name}!`);
                                        }
                                      }}
                                      className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                                        isInstalled 
                                          ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30' 
                                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                                      }`}
                                    >
                                      {isInstalled ? 'OPEN' : 'INSTALL'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      )}

                      {/* TAB 2: CATEGORIES */}
                      {!fdroidSelectedApp && fdroidActiveTab === 'categories' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { name: 'Multimedia', count: '142 apps', icon: Play, color: 'from-purple-600 to-indigo-600' },
                              { name: 'Development', count: '89 apps', icon: Terminal, color: 'from-slate-700 to-slate-900' },
                              { name: 'Security', count: '64 apps', icon: ShieldCheck, color: 'from-rose-600 to-red-700' },
                              { name: 'Navigation', count: '38 apps', icon: MapPin, color: 'from-amber-600 to-orange-700' },
                              { name: 'Internet', count: '120 apps', icon: Compass, color: 'from-blue-600 to-cyan-600' },
                              { name: 'Connectivity', count: '55 apps', icon: Radio, color: 'from-emerald-600 to-teal-700' }
                            ].map((cat) => (
                              <div
                                key={cat.name}
                                onClick={(e) => {
                                  setFdroidSelectedCategory(fdroidSelectedCategory === cat.name ? null : cat.name);
                                  setFdroidActiveTab('latest');
                                  toast.info(`Filtering by ${cat.name}`);
                                }}
                                className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                                  fdroidSelectedCategory === cat.name 
                                    ? 'bg-blue-950/80 border-blue-500 text-white' 
                                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-white mb-2 shadow`}>
                                  <cat.icon size={15} />
                                </div>
                                <h4 className="text-xs font-bold text-white">{cat.name}</h4>
                                <span className="text-[9px] text-slate-400 font-mono">{cat.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TAB 3: UPDATES */}
                      {!fdroidSelectedApp && fdroidActiveTab === 'updates' && (
                        <div className="space-y-2">
                          <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-white">3 Updates Available</h4>
                              <p className="text-[9px] text-slate-400">All updates verified against signing keys</p>
                            </div>
                            <button
                              onClick={() => {
                                toast.success("Updated all apps to latest versions!");
                                setFdroidInstalledApps(prev => ({
                                  ...prev,
                                  'org.schabi.newpipe': true,
                                  'org.videolan.vlc': true,
                                  'org.mozilla.fennec_fdroid': true
                                }));
                              }}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase cursor-pointer"
                            >
                              UPDATE ALL
                            </button>
                          </div>

                          {displayedFdroidApps.filter(a => a.hasUpdate).map(app => (
                            <div key={app.id} className="p-2.5 bg-slate-900/80 rounded-2xl border border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${app.iconBg} flex items-center justify-center text-white font-bold text-xs`}>
                                  {app.name.charAt(0)}
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold text-white">{app.name}</h4>
                                  <span className="text-[8px] font-mono text-amber-400">{app.version} → {app.updateVersion}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  toast.success(`Updated ${app.name} to ${app.updateVersion}!`);
                                }}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase cursor-pointer"
                              >
                                UPDATE
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* TAB 4: SETTINGS & REPOSITORIES */}
                      {!fdroidSelectedApp && fdroidActiveTab === 'settings' && (
                        <div className="space-y-2.5">
                          <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Repository Sources</span>
                            {Object.entries(fdroidRepoToggles).map(([repoName, enabled]) => (
                              <div key={repoName} className="flex items-center justify-between text-xs text-slate-300 py-1 border-b border-slate-800/60 last:border-0">
                                <span className="font-medium text-[11px] truncate max-w-[200px]">{repoName}</span>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={(e) => {
                                    setFdroidRepoToggles(prev => ({ ...prev, [repoName]: e.target.checked }));
                                    toast.info(`Updated repository: ${repoName}`);
                                  }}
                                  className="rounded accent-blue-500 cursor-pointer"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Network & Preferences</span>
                            <div className="flex items-center justify-between text-xs text-slate-300">
                              <span>Download over Wi-Fi only</span>
                              <input
                                type="checkbox"
                                checked={fdroidWifiOnly}
                                onChange={(e) => setFdroidWifiOnly(e.target.checked)}
                                className="rounded accent-blue-500 cursor-pointer"
                              />
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                              <span>Automatic Update Check</span>
                              <select
                                value={fdroidAutoUpdateInterval}
                                onChange={(e) => setFdroidAutoUpdateInterval(e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-[10px] text-white"
                              >
                                <option value="Always">Always</option>
                                <option value="Daily">Daily</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Never">Never</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottom F-Droid Navigation Bar */}
                      <div className="h-11 bg-slate-950/95 border-t border-slate-800/80 rounded-xl flex items-center justify-around text-slate-400 px-1">
                        {[
                          { id: 'latest', label: 'Latest', icon: Flame },
                          { id: 'categories', label: 'Categories', icon: Folder },
                          { id: 'updates', label: 'Updates', icon: RotateCw },
                          { id: 'settings', label: 'Settings', icon: SlidersHorizontal }
                        ].map((t) => {
                          const isActive = fdroidActiveTab === t.id && !fdroidSelectedApp;
                          const elem = currentElements.find(el => el.id === `elem-fdroid-tab-${t.id}`) || currentElements[0];
                          return (
                            <button
                              key={t.id}
                              onClick={(e) => {
                                setFdroidSelectedApp(null);
                                setFdroidActiveTab(t.id as any);
                                handleElementClick(elem, e);
                              }}
                              className={`flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
                                isActive ? 'text-blue-400 font-bold' : 'hover:text-slate-200'
                              }`}
                            >
                              <t.icon size={13} />
                              <span className="text-[7px] uppercase tracking-wider">{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 11. MALARM MINIMALIST ALARM CLOCK INTERACTIVE ANDROID APPLICATION */}
                {appMeta.archetype === 'malarm' && (() => {
                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                      {/* Malarm Minimalist Header */}
                      <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow">
                            <Clock size={15} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white">Malarm</h4>
                            <span className="text-[8px] font-mono text-slate-400">Minimalist Alarm</span>
                          </div>
                        </div>
                        <span className="text-[8px] px-2 py-0.5 rounded-full font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {malarmAlarms.filter(a => a.enabled).length} ACTIVE
                        </span>
                      </div>

                      {/* Prominent Digital Clock Widget */}
                      <div 
                        onClick={(e) => {
                          handleElementClick(currentElements.find(el => el.id === 'elem-malarm-digital-clock') || currentElements[0], e);
                        }}
                        className="p-4 bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border border-slate-800 text-center space-y-1 shadow-inner cursor-pointer"
                      >
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">System Time</span>
                        <div className="text-3xl font-black text-white font-mono tracking-tight flex items-baseline justify-center gap-1.5">
                          <span>08:26</span>
                          <span className="text-xs font-bold text-amber-400">AM</span>
                        </div>
                        <p className="text-[10px] text-emerald-400 font-mono">
                          Next alarm in 14 hours 4 minutes
                        </p>
                      </div>

                      {/* Alarms List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <span>YOUR ALARMS</span>
                          <span className="text-amber-400 font-mono">{malarmAlarms.length} SET</span>
                        </div>

                        <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-0.5">
                          {malarmAlarms.map((al) => (
                            <div
                              key={al.id}
                              onClick={(e) => {
                                handleElementClick(currentElements.find(el => el.id === `elem-malarm-card-${al.id}`) || currentElements[0], e);
                              }}
                              className={`p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                                al.enabled 
                                  ? 'bg-slate-900 border-amber-500/30 text-white shadow-md' 
                                  : 'bg-slate-950/80 border-slate-850 text-slate-500 opacity-60'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-xl font-black font-mono tracking-tight text-white">{al.time}</span>
                                  <span className="text-[10px] font-black text-amber-400">{al.period}</span>
                                </div>
                                <span className="text-[10px] font-bold text-slate-300 block">{al.label}</span>
                                <div className="flex items-center gap-1 text-[8px] font-mono text-slate-400">
                                  <span>{al.days.join(', ')}</span>
                                  <span>•</span>
                                  <span>{al.ringtone}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleElementClick(currentElements.find(el => el.id === `elem-malarm-delete-${al.id}`) || currentElements[0], e);
                                    setMalarmAlarms(prev => prev.filter(a => a.id !== al.id));
                                    toast.info(`Deleted alarm ${al.time} ${al.period}`);
                                  }}
                                  className="p-1 rounded-lg hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition-colors"
                                  title="Delete"
                                >
                                  <Delete size={14} />
                                </button>
                                <input
                                  type="checkbox"
                                  checked={al.enabled}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleElementClick(currentElements.find(el => el.id === `elem-malarm-switch-${al.id}`) || currentElements[0], e as any);
                                    setMalarmAlarms(prev => prev.map(a => a.id === al.id ? { ...a, enabled: e.target.checked } : a));
                                    toast.success(`${e.target.checked ? 'Enabled' : 'Disabled'} alarm ${al.time}`);
                                  }}
                                  className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Add Alarm Floating Button */}
                      {!malarmIsAdding && (
                        <button
                          onClick={(e) => {
                            setMalarmIsAdding(true);
                            handleElementClick(currentElements.find(el => el.id === 'elem-malarm-fab-add') || currentElements[0], e);
                          }}
                          className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950 cursor-pointer transition-all active:scale-95"
                        >
                          <span>+ ADD NEW ALARM</span>
                        </button>
                      )}

                      {/* Add / Edit Alarm Dialog Modal */}
                      {malarmIsAdding && (
                        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/40 space-y-2.5 shadow-xl animate-in zoom-in-95 duration-150">
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block">Set Alarm Time</span>
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="12"
                              value={malarmNewHour}
                              onChange={(e) => setMalarmNewHour(e.target.value.padStart(2, '0'))}
                              className="w-14 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-lg font-black text-white font-mono focus:border-amber-500"
                            />
                            <span className="text-xl font-black text-slate-500">:</span>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              value={malarmNewMinute}
                              onChange={(e) => setMalarmNewMinute(e.target.value.padStart(2, '0'))}
                              className="w-14 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-lg font-black text-white font-mono focus:border-amber-500"
                            />
                            <div className="flex rounded-xl overflow-hidden border border-slate-800">
                              <button
                                onClick={() => setMalarmNewPeriod('AM')}
                                className={`px-2.5 py-1.5 text-xs font-bold ${malarmNewPeriod === 'AM' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                              >
                                AM
                              </button>
                              <button
                                onClick={() => setMalarmNewPeriod('PM')}
                                className={`px-2.5 py-1.5 text-xs font-bold ${malarmNewPeriod === 'PM' ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-400'}`}
                              >
                                PM
                              </button>
                            </div>
                          </div>

                          <input
                            type="text"
                            value={malarmNewLabel}
                            onChange={(e) => setMalarmNewLabel(e.target.value)}
                            placeholder="Alarm label..."
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500"
                          />

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              onClick={() => setMalarmIsAdding(false)}
                              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                const newId = `alarm-${Date.now()}`;
                                setMalarmAlarms(prev => [
                                  ...prev,
                                  {
                                    id: newId,
                                    time: `${malarmNewHour}:${malarmNewMinute}`,
                                    period: malarmNewPeriod,
                                    label: malarmNewLabel || 'Alarm',
                                    days: malarmNewDays,
                                    enabled: true,
                                    vibration: malarmNewVibrate,
                                    ringtone: malarmNewRingtone
                                  }
                                ]);
                                setMalarmIsAdding(false);
                                toast.success(`Saved alarm ${malarmNewHour}:${malarmNewMinute} ${malarmNewPeriod}!`);
                              }}
                              className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase cursor-pointer"
                            >
                              Save Alarm
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 9. EDUCATION / MILES EDUCATION NATIVE INTERACTIVE APPLICATION SCREEN */}
                {appMeta.archetype === 'education' && (() => {
                  const apkAssets = getApkAssets(pkg, mobileApkName);
                  const themeColor = '#0B2545';
                  const appTitle = apkAssets?.appName || appMeta.displayName || 'Miles Education';
                  const isHomeTab = activeTab === 'home' || !activeTab;
                  const isCairaTab = activeTab === 'caira' || activeTab === 'mock_test' || activeTab === 'exam' || activeTab === 'practice';
                  const isProgramsTab = activeTab === 'programs' || activeTab === 'courses' || activeTab === 'catalog';
                  const isWebinarsTab = activeTab === 'webinars' || activeTab === 'classroom' || activeTab === 'live_class' || activeTab === 'video';
                  const isReferTab = activeTab === 'refer' || activeTab === 'referral' || activeTab === 'refer_earn' || activeTab === 'profile' || activeTab === 'student_hub' || activeTab === 'notes' || activeTab === 'study_vault';
                  
                  const isCoursesTab = isHomeTab || isProgramsTab;
                  const isClassroomTab = isWebinarsTab;
                  const isMockTab = isCairaTab;
                  const isNotesTab = isReferTab;
                  const isProfileTab = isReferTab;

                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                      {/* Miles Education Top App Bar */}
                      <div className="p-3 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-blue-500/30 text-white flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-2.5">
                          {apkAssets?.appIcon ? (
                            <img 
                              src={apkAssets.appIcon} 
                              alt="App Icon"
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-xl object-contain drop-shadow bg-slate-950 p-1 border border-blue-500/40 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shrink-0">
                              <GraduationCap size={18} />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-black text-white truncate tracking-wide">{appTitle}</h4>
                            <p className="text-[9px] text-blue-300 font-mono truncate">US CPA • CMA • ACCA Global</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            AICPA CERTIFIED
                          </span>
                        </div>
                      </div>

                      {/* TAB 1: PROGRAMS & COURSES CATALOG */}
                      {isCoursesTab && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Search & Category Filter */}
                          <div className="space-y-2">
                            <div className="relative">
                              <input
                                type="text"
                                value={eduSearchQuery}
                                onChange={(e) => setEduSearchQuery(e.target.value)}
                                onClick={(e) => {
                                  handleElementClick(currentElements.find(el => el.id === 'elem-edu-search-bar') || currentElements[0], e);
                                }}
                                placeholder="Search CPA, CMA, ACCA courses..."
                                className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                              />
                              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                            </div>

                            {/* Category Filter Chips */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold">
                              {[
                                { id: 'all', label: 'All Programs' },
                                { id: 'accounting', label: 'Accounting (CPA/ACCA)' },
                                { id: 'finance', label: 'Finance (CMA)' },
                                { id: 'analytics', label: 'Financial AI & Analytics' }
                              ].map((cat) => (
                                <button
                                  key={cat.id}
                                  onClick={() => setEduFilterCategory(cat.id as any)}
                                  className={`px-2.5 py-1 rounded-xl border whitespace-nowrap cursor-pointer transition-all ${
                                    eduFilterCategory === cat.id
                                      ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {cat.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Hero Certification Banner */}
                          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-900/60 via-indigo-950/80 to-slate-900 border border-blue-500/40 space-y-1.5 shadow-md">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                                100% PLACEMENT SUPPORT
                              </span>
                              <span className="text-[9px] font-mono text-emerald-400 font-bold">BIG 4 HIRING PARTNERS</span>
                            </div>
                            <h3 className="text-xs font-black text-white">US CPA Master Program (AICPA Certified)</h3>
                            <p className="text-[10px] text-slate-300">
                              Comprehensive 4-part CPA certification program with lead faculty mentorship, Becker study materials, and mock exam simulations.
                            </p>
                          </div>

                          {/* Courses Catalog List */}
                          <div className="space-y-2.5">
                            {displayedEduCourses.map((course) => {
                              const isEnrolled = eduEnrolledList.includes(course.id);
                              return (
                                <div
                                  key={course.id}
                                  onClick={(e) => {
                                    setEduSelectedCourseId(course.id);
                                    handleElementClick(currentElements.find(el => el.id === (course.id === 'cpa_course' ? 'elem-edu-btn-cpa-course' : 'elem-edu-btn-cma-course')) || currentElements[0], e);
                                  }}
                                  className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                                    eduSelectedCourseId === course.id
                                      ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500/40 shadow-md'
                                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <h4 className="text-xs font-bold text-white">{course.name}</h4>
                                        <span className="text-[8px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">{course.badge}</span>
                                      </div>
                                      <p className="text-[9px] text-slate-400 font-mono">{course.code} • {course.duration}</p>
                                    </div>
                                    <span className="text-xs font-black text-emerald-400 font-mono shrink-0">{course.price}</span>
                                  </div>

                                  <p className="text-[10px] text-slate-300 line-clamp-2">{course.desc}</p>

                                  <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                                    <div className="flex items-center gap-2 text-[9px] text-slate-400">
                                      <span className="flex items-center gap-0.5 text-amber-400"><Star size={10} fill="currentColor" /> {course.rating}</span>
                                      <span>•</span>
                                      <span>{course.students}</span>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isEnrolled) {
                                          setEduEnrolledList(prev => [...prev, course.id]);
                                          toast.success(`Enrolled in ${course.name}! Accessing classroom...`);
                                        }
                                        setActiveTab('classroom');
                                        handleElementClick(currentElements.find(el => el.id === 'elem-edu-btn-enroll-primary') || currentElements[0], e);
                                      }}
                                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        isEnrolled 
                                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow'
                                      }`}
                                    >
                                      {isEnrolled ? 'Open Classroom' : 'Enroll Now'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* TAB 2: CLASSROOM & VIDEO LECTURES */}
                      {isClassroomTab && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Interactive Simulated Video Player */}
                          <div className="relative rounded-2xl overflow-hidden border border-blue-500/40 bg-slate-950 shadow-xl">
                            <div className="aspect-video bg-gradient-to-tr from-slate-950 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 text-center relative">
                              {/* Video Watermark */}
                              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded text-[8px] text-blue-300 font-mono border border-white/10">
                                <GraduationCap size={10} /> MILES CLASSROOM LIVE
                              </div>
                              <div className="absolute top-2 right-2 text-[8px] text-emerald-400 font-mono font-bold bg-black/40 px-2 py-0.5 rounded border border-white/10">
                                1080p HD
                              </div>

                              {/* Play/Pause Center Button */}
                              <button
                                onClick={(e) => {
                                  setEduIsVideoPlaying(!eduIsVideoPlaying);
                                  handleElementClick(currentElements.find(el => el.id === 'elem-edu-btn-play-lecture') || currentElements[0], e);
                                  toast.info(eduIsVideoPlaying ? "Lecture paused" : "Streaming lecture: " + eduActiveVideoChapter);
                                }}
                                className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl transition-all cursor-pointer transform hover:scale-105 active:scale-95 ${
                                  eduIsVideoPlaying 
                                    ? 'bg-blue-600 ring-4 ring-blue-500/30' 
                                    : 'bg-gradient-to-tr from-blue-600 to-indigo-600 ring-4 ring-blue-500/20'
                                }`}
                              >
                                {eduIsVideoPlaying ? <Pause size={20} className="fill-white" /> : <Play size={20} className="fill-white ml-0.5" />}
                              </button>

                              <h4 className="text-xs font-black text-white mt-3 line-clamp-1">{eduActiveVideoChapter}</h4>
                              <p className="text-[9px] text-slate-400">Varun Jain • Lead CPA Faculty & Founder</p>

                              {/* Animated Video Progress Bar */}
                              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800">
                                <div className={`h-full bg-blue-500 transition-all ${eduIsVideoPlaying ? 'w-2/3 animate-pulse' : 'w-1/4'}`} />
                              </div>
                            </div>
                          </div>

                          {/* Course Chapter Modules List */}
                          <div className="space-y-2 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800">
                            <div className="flex items-center justify-between px-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              <span>FAR CHAPTER LECTURES</span>
                              <span className="text-blue-400 font-mono">4 MODULES</span>
                            </div>

                            {[
                              'FAR 1.1: US GAAP vs IFRS Framework & Recognition',
                              'AUD 2.3: Internal Control & Substantive Testing',
                              'REG 3.2: Federal Taxation for C-Corporations & Pass-Throughs',
                              'BAR 4.1: Advanced Technical Accounting & Analytics'
                            ].map((chap, idx) => {
                              const isActive = eduActiveVideoChapter === chap;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setEduActiveVideoChapter(chap);
                                    setEduIsVideoPlaying(true);
                                    toast.info(`Switched lecture to ${chap}`);
                                  }}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                    isActive 
                                      ? 'bg-blue-950/80 border-blue-500 text-white' 
                                      : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
                                    }`}>
                                      {idx + 1}
                                    </div>
                                    <span className="text-xs font-bold truncate">{chap}</span>
                                  </div>
                                  <span className="text-[9px] font-mono text-slate-400 shrink-0">45 mins</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Ask Mentor AI Doubt Solver */}
                          <div className="p-3 bg-slate-900 rounded-2xl border border-blue-500/30 space-y-2">
                            <div className="flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              <span>LIVE FACULTY & AI DOUBT SOLVER</span>
                              <span className="text-emerald-400 font-mono">INSTANT RESPONSE</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={eduDoubtText}
                                onChange={(e) => setEduDoubtText(e.target.value)}
                                placeholder="Ask faculty about GAAP standard, formula, or Becker MCQs..."
                                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                              />
                              <button
                                onClick={() => {
                                  if (!eduDoubtText.trim()) return;
                                  toast.success("Query submitted to Miles Lead Faculty! Mentor Answer: Under ASC 606-10-25-14, promises in a contract are distinct if the customer can benefit from the good or service either on its own or together with other readily available resources.");
                                  setEduDoubtText('');
                                }}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow"
                              >
                                Ask Mentor
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* TAB 3: MOCK EXAM & PRACTICE */}
                      {isMockTab && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Score Header */}
                          <div className="p-3 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 rounded-2xl border border-blue-500/40 flex items-center justify-between shadow-md">
                            <div>
                              <span className="text-[8px] font-mono text-blue-300 uppercase block">CPA Simulation Exam</span>
                              <h4 className="text-xs font-black text-white">FAR Section Practice Test</h4>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-mono text-slate-400 block">Predicted Pass Rate</span>
                              <span className="text-sm font-black text-emerald-400 font-mono">88% (Passing: 75)</span>
                            </div>
                          </div>

                          {/* MCQ Question Card */}
                          {(() => {
                            const curQ = eduQuizQuestions[eduQuizQuestionIdx] || eduQuizQuestions[0];
                            return (
                              <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                                <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-400">
                                  <span>QUESTION {eduQuizQuestionIdx + 1} OF {eduQuizQuestions.length}</span>
                                  <span className="text-blue-400">AICPA EXAM PATTERN</span>
                                </div>

                                <p className="text-xs font-bold text-white leading-relaxed">{curQ.question}</p>

                                {/* Options List */}
                                <div className="space-y-2">
                                  {curQ.options.map((opt, i) => {
                                    const isSelected = eduSelectedAnswer === opt;
                                    const isCorrect = eduQuizSubmitted && opt === curQ.correctAnswer;
                                    const isWrong = eduQuizSubmitted && isSelected && opt !== curQ.correctAnswer;

                                    return (
                                      <div
                                        key={i}
                                        onClick={() => {
                                          if (eduQuizSubmitted) return;
                                          setEduSelectedAnswer(opt);
                                        }}
                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                                          isCorrect 
                                            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' 
                                            : isWrong 
                                            ? 'bg-rose-950/80 border-rose-500 text-rose-200'
                                            : isSelected
                                            ? 'bg-blue-950/80 border-blue-500 text-white'
                                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                        }`}
                                      >
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5 ${
                                          isSelected ? 'border-blue-400 bg-blue-600 text-white' : 'border-slate-700 text-slate-400'
                                        }`}>
                                          {String.fromCharCode(65 + i)}
                                        </div>
                                        <span className="leading-snug">{opt}</span>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Explanation Banner after submission */}
                                {eduQuizSubmitted && (
                                  <div className="p-3 rounded-xl bg-slate-950 border border-blue-500/40 text-[10px] space-y-1">
                                    <span className="font-bold text-emerald-400 block">✓ Correct Concept Explanation:</span>
                                    <p className="text-slate-300">{curQ.explanation}</p>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 pt-1">
                                  {!eduQuizSubmitted ? (
                                    <button
                                      onClick={(e) => {
                                        if (!eduSelectedAnswer) {
                                          toast.error("Please select an answer option first");
                                          return;
                                        }
                                        setEduQuizSubmitted(true);
                                        handleElementClick(currentElements.find(el => el.id === 'elem-edu-btn-submit-mock') || currentElements[0], e);
                                        toast.success("Mock Answer Evaluated!");
                                      }}
                                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <CheckCircle2 size={13} /> Submit Answer & Validate
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEduQuizSubmitted(false);
                                        setEduSelectedAnswer(null);
                                        setEduQuizQuestionIdx((prev) => (prev + 1) % eduQuizQuestions.length);
                                      }}
                                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      Next Practice Question <ArrowRight size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* TAB 4: STUDY VAULT & FLASHCARDS */}
                      {isNotesTab && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between px-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                            <span>REVISION VAULT & FORMULA FLASHCARDS</span>
                            <span className="text-blue-400 font-mono">BECKER CERTIFIED</span>
                          </div>

                          {[
                            { title: 'Revenue Recognition 5-Step Model (ASC 606)', tag: 'FAR Core', desc: '1. Identify contract -> 2. Identify performance obligations -> 3. Determine transaction price -> 4. Allocate price -> 5. Recognize revenue upon satisfaction.' },
                            { title: 'Lease Accounting (ASC 842: Finance vs Operating)', tag: 'FAR Standard', desc: 'Classification tests: Transfer of ownership, Purchase option reasonably certain, Lease term major part of economic life, Present value substantially all fair value.' },
                            { title: 'Audit Evidence & Assertions (Management Representation)', tag: 'AUD Core', desc: 'Completeness, Valuation, Existence, Rights & Obligations, Presentation & Disclosure (COVER U).' }
                          ].map((note, idx) => (
                            <div key={idx} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1.5 hover:border-blue-500/40 transition-all">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-white">{note.title}</h4>
                                <span className="text-[8px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">{note.tag}</span>
                              </div>
                              <p className="text-[10px] text-slate-300 leading-relaxed">{note.desc}</p>
                            </div>
                          ))}

                          <button
                            onClick={() => toast.success("Downloading Miles CPA Quick Revision Mindmap (PDF, 4.8 MB)...")}
                            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-blue-500/30 text-blue-300 font-bold text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Download size={13} /> Download Becker Revision Study Guide (PDF)
                          </button>
                        </div>
                      )}

                      {/* TAB 5: STUDENT HUB & CREDENTIALS */}
                      {isProfileTab && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {/* Student ID Card */}
                          <div className="p-4 rounded-3xl bg-gradient-to-tr from-blue-950 via-slate-900 to-indigo-950 border border-blue-400/40 text-white space-y-3 shadow-xl">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GraduationCap size={18} className="text-blue-300" />
                                <span className="font-black text-xs tracking-wider">MILES STUDENT ID</span>
                              </div>
                              <span className="text-[8px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ACTIVE CANDIDATE</span>
                            </div>

                            <div className="space-y-0.5 pt-1">
                              <h3 className="text-sm font-black">{eduStudentName}</h3>
                              <p className="text-[10px] text-blue-200 font-mono">Roll No: {eduStudentRoll}</p>
                              <p className="text-[10px] text-blue-200 font-mono">Program: US CPA Master Class (2026 Batch)</p>
                            </div>

                            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                              <span>Sections Passed: <strong>3 / 4 (AUD, FAR, REG)</strong></span>
                              <span className="text-emerald-400 font-mono font-bold">Passing Avg: 89</span>
                            </div>
                          </div>

                          {/* Quick Placement Services */}
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                            <h4 className="text-xs font-bold text-white">Big 4 & Corporate Placement Hub</h4>
                            <p className="text-[10px] text-slate-400">Direct interview shortlist with EY, Deloitte, PwC, KPMG, BDO, Grant Thornton.</p>
                            <button
                              onClick={() => toast.success("Connected to Miles Corporate Placement Desk!")}
                              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow transition-all cursor-pointer"
                            >
                              Access Placement Portal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 10. GENERIC / UPLOADED APK NATIVE INTERACTIVE APPLICATION SCREEN */}
                {appMeta.archetype !== 'saucelabs' && appMeta.archetype !== 'whatsapp' && appMeta.archetype !== 'chrome' && appMeta.archetype !== 'qalculate' && appMeta.archetype !== 'wdio' && appMeta.archetype !== 'health_insurance' && appMeta.archetype !== 'machaxi' && appMeta.archetype !== 'sound_recorder' && appMeta.archetype !== 'apidemos' && appMeta.archetype !== 'fdroid' && appMeta.archetype !== 'malarm' && appMeta.archetype !== 'education' && (() => {
                  const apkAssets = getApkAssets(pkg, mobileApkName);
                  const themeColor = apkAssets?.colors?.primary || appMeta.theme.primary;
                  const appTitle = apkAssets?.appName || appMeta.displayName || 'Android App';
                  const allImgs = apkAssets?.allImages || [];
                  const heroImg = apkAssets?.bannerImage || (allImgs.length > 0 ? allImgs[0].dataUrl : null);

                  return (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                      {/* App Header Banner */}
                      <div 
                        className="p-3 rounded-2xl border flex items-center justify-between shadow-md"
                        style={{ 
                          backgroundColor: `${themeColor}18`,
                          borderColor: `${themeColor}40`
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          {apkAssets?.appIcon ? (
                            <img 
                              src={apkAssets.appIcon} 
                              alt="App Icon"
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-xl object-contain drop-shadow bg-slate-950 p-1 border border-slate-800 shrink-0"
                            />
                          ) : (
                            <div 
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0"
                              style={{ backgroundColor: themeColor }}
                            >
                              {appTitle.charAt(0)}
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-black text-white truncate">{appTitle}</h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate">{pkg}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] px-2 py-1 rounded-lg font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            NATIVE APK
                          </span>
                        </div>
                      </div>

                      {/* Search Bar */}
                      <div className="relative">
                        <input
                          type="text"
                          value={genericSearch}
                          onChange={(e) => setGenericSearch(e.target.value)}
                          onClick={(e) => {
                            handleElementClick(currentElements.find(el => el.id === 'elem-apk-search-bar') || currentElements[0], e);
                          }}
                          placeholder={`Search in ${appTitle}...`}
                          className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                      </div>

                      {/* VIEW 1: OVERVIEW & NATIVE ACTIVITIES */}
                      {(activeTab === 'dashboard' || activeTab === 'catalog' || activeTab === 'explore' || activeTab === 'restaurants' || activeTab === 'home' || activeTab === 'feed') && (
                        <div className="space-y-3">
                          {/* Hero Showcase Banner */}
                          <div 
                            onClick={(e) => {
                              handleElementClick(currentElements.find(el => el.id === 'elem-apk-toolbar') || currentElements[0], e);
                              toast.info(`Inspected ${appTitle} container`);
                            }}
                            className="p-3.5 rounded-2xl border relative overflow-hidden group cursor-pointer transition-all hover:border-slate-600 shadow-md"
                            style={{ 
                              background: `linear-gradient(135deg, ${themeColor}30, #0f172a)`
                            }}
                          >
                            <div className="relative z-10 space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/20">
                                {appMeta.category.toUpperCase()}
                              </span>
                              <h3 className="text-sm font-black text-white">{appTitle}</h3>
                              <p className="text-[10px] text-slate-300 max-w-[210px]">
                                Real-time dynamic UI Automator inspection running on native Android 14.
                              </p>
                            </div>
                            {heroImg && (
                              <img 
                                src={heroImg} 
                                alt="APK Banner" 
                                referrerPolicy="no-referrer"
                                className="absolute right-2 bottom-1 w-20 h-20 object-contain drop-shadow-xl opacity-90 group-hover:scale-105 transition-transform" 
                              />
                            )}
                          </div>

                          {/* Discovered Activities Launcher List */}
                          <div className="space-y-2 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800">
                            <div className="flex items-center justify-between px-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              <span>DISCOVERED NATIVE ACTIVITIES</span>
                              <span className="text-indigo-400 font-mono">4 DETECTED</span>
                            </div>
                            {[
                              { name: 'MainActivity', tab: 'dashboard', desc: 'Main Launch Intent & Core Interface', isMain: true },
                              { name: 'FormControlsActivity', tab: 'form', desc: 'Interactive User Input & Dialogs', isMain: false },
                              { name: 'DataSyncActivity', tab: 'records', desc: 'Cloud Data & Background Operations', isMain: false },
                              { name: 'FeatureSettingsActivity', tab: 'settings', desc: 'Application Configuration & Preferences', isMain: false }
                            ].map((act) => (
                              <div 
                                key={act.name}
                                onClick={(e) => {
                                  setActiveTab(act.tab);
                                  handleElementClick({
                                    id: `elem-act-${act.name}`,
                                    name: `Activity: .${act.name}`,
                                    type: 'android.widget.TextView',
                                    resourceId: `${pkg}:id/activity_${act.name.toLowerCase()}`,
                                    accessibilityId: act.name,
                                    xpath: `//android.widget.TextView[@text=".${act.name}"]`,
                                    bounds: '[40,300][1040,380]',
                                    text: `.${act.name}`,
                                    screen: act.tab,
                                    clickable: true,
                                    enabled: true
                                  }, e);
                                  toast.success(`Navigated to .${act.name}`);
                                }}
                                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-between cursor-pointer transition-all group"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">.{act.name}</span>
                                    {act.isMain && (
                                      <span className="text-[8px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">MAIN</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400">{act.desc}</p>
                                </div>
                                <button 
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-sm shrink-0"
                                  style={{ backgroundColor: themeColor }}
                                >
                                  Open
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Quick Navigation Action Buttons */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                setActiveTab('form');
                                handleElementClick({
                                  id: 'elem-apk-quicknav-form',
                                  name: 'Quick Action: Open Form Controls',
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/btn_quick_form`,
                                  accessibilityId: 'Open Form',
                                  xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_quick_form"]`,
                                  bounds: '[40,650][520,730]',
                                  text: 'Open Form',
                                  screen: 'form',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all active:scale-95"
                            >
                              <Edit3 size={18} className="text-indigo-400" />
                              <span className="text-[10px] font-black text-white uppercase">Form Controls</span>
                            </button>
                            <button
                              onClick={(e) => {
                                setActiveTab('settings');
                                handleElementClick({
                                  id: 'elem-apk-quicknav-settings',
                                  name: 'Quick Action: Open Settings',
                                  type: 'android.widget.Button',
                                  resourceId: `${pkg}:id/btn_quick_settings`,
                                  accessibilityId: 'Open Settings',
                                  xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_quick_settings"]`,
                                  bounds: '[540,650][1040,730]',
                                  text: 'Open Settings',
                                  screen: 'settings',
                                  clickable: true,
                                  enabled: true
                                }, e);
                              }}
                              className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all active:scale-95"
                            >
                              <Settings size={18} className="text-amber-400" />
                              <span className="text-[10px] font-black text-white uppercase">App Settings</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* VIEW 2: INTERACTIVE CONTROLS & FORM */}
                      {(activeTab === 'form' || activeTab === 'booking' || activeTab === 'transfer' || activeTab === 'checkout' || activeTab === 'login') && (
                        <div className="space-y-2.5">
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">USER FULL NAME</span>
                            <input 
                              type="text" 
                              value={genericFormName} 
                              onChange={(e) => setGenericFormName(e.target.value)}
                              onClick={(e) => handleElementClick(currentElements.find(el => el.id === 'elem-apk-input-name') || currentElements[0], e)}
                              className="bg-transparent text-xs text-white focus:outline-none w-full font-bold"
                            />
                          </div>

                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">EMAIL ADDRESS</span>
                            <input 
                              type="email" 
                              value={genericFormEmail} 
                              onChange={(e) => setGenericFormEmail(e.target.value)}
                              onClick={(e) => handleElementClick(currentElements.find(el => el.id === 'elem-apk-input-email') || currentElements[0], e)}
                              className="bg-transparent text-xs text-white focus:outline-none w-full font-bold"
                            />
                          </div>

                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">PASSWORD / PIN</span>
                            <input 
                              type="password" 
                              value={genericPassword} 
                              onChange={(e) => setGenericPassword(e.target.value)}
                              className="bg-transparent text-xs text-white focus:outline-none w-full font-bold"
                            />
                          </div>

                          <div 
                            onClick={(e) => {
                              setGenericTermsAccepted(!genericTermsAccepted);
                              handleElementClick(currentElements.find(el => el.id === 'elem-apk-switch-toggle') || currentElements[0], e);
                            }}
                            className="flex items-center gap-2 px-2 py-1 text-[11px] text-slate-300 cursor-pointer"
                          >
                            <input 
                              type="checkbox" 
                              checked={genericTermsAccepted} 
                              onChange={() => {}}
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                            />
                            <span>I agree to the App Terms & Conditions</span>
                          </div>

                          <button
                            onClick={(e) => {
                              handleElementClick({
                                id: 'elem-apk-btn-primary-action',
                                name: 'Button: Save & Submit Entry',
                                type: 'android.widget.Button',
                                resourceId: `${pkg}:id/btn_action_primary`,
                                accessibilityId: 'Save & Submit Entry',
                                xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_action_primary"]`,
                                bounds: '[40,800][1040,900]',
                                text: 'Save & Submit Entry',
                                screen: 'form',
                                clickable: true,
                                enabled: true
                              }, e);
                              setActiveTab('records');
                              toast.success(`Entry Saved in ${appTitle}! Navigated to Records.`);
                            }}
                            className="w-full py-3 rounded-2xl text-xs font-black text-white shadow-lg cursor-pointer transition-all active:scale-95"
                            style={{ backgroundColor: themeColor }}
                          >
                            Save & Submit Entry <Check size={14} className="inline ml-1" />
                          </button>
                        </div>
                      )}

                      {/* VIEW 3: SETTINGS & PERMISSIONS */}
                      {(activeTab === 'settings' || activeTab === 'display' || activeTab === 'about' || activeTab === 'profile') && (
                        <div className="space-y-2.5">
                          {/* App Package Information Card */}
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">APK MANIFEST INFO</span>
                              <span className="text-[9px] font-mono text-emerald-400 font-bold">SDK 34 (Android 14)</span>
                            </div>
                            <div className="text-xs space-y-1 font-mono">
                              <p className="text-slate-300"><span className="text-slate-500">Package:</span> {pkg}</p>
                              <p className="text-slate-300"><span className="text-slate-500">Activity:</span> {appMeta.launchActivity}</p>
                              <p className="text-slate-300"><span className="text-slate-500">Min SDK:</span> 24 (Android 7.0)</p>
                            </div>
                          </div>

                          {/* Toggle Switches */}
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                            <div 
                              onClick={(e) => {
                                setGenericNotificationToggle(!genericNotificationToggle);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apk-switch-notifications') || currentElements[0], e);
                              }}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <h5 className="text-xs font-bold text-white">Push Notifications</h5>
                                <p className="text-[10px] text-slate-400">Receive instant in-app alerts</p>
                              </div>
                              <div className={`w-10 h-5 rounded-full transition-colors relative ${genericNotificationToggle ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${genericNotificationToggle ? 'right-0.5' : 'left-0.5'}`} />
                              </div>
                            </div>

                            <div className="h-px bg-slate-800" />

                            <div 
                              onClick={(e) => {
                                setGenericDarkModeToggle(!genericDarkModeToggle);
                                handleElementClick(currentElements.find(el => el.id === 'elem-apk-switch-darkmode') || currentElements[0], e);
                              }}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <h5 className="text-xs font-bold text-white">Dark Mode Theme</h5>
                                <p className="text-[10px] text-slate-400">High contrast night palette</p>
                              </div>
                              <div className={`w-10 h-5 rounded-full transition-colors relative ${genericDarkModeToggle ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${genericDarkModeToggle ? 'right-0.5' : 'left-0.5'}`} />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              handleElementClick({
                                id: 'elem-apk-btn-signout',
                                name: 'Button: Sign Out Account',
                                type: 'android.widget.Button',
                                resourceId: `${pkg}:id/btn_account_signout`,
                                accessibilityId: 'Sign Out Account',
                                xpath: `//android.widget.Button[@resource-id="${pkg}:id/btn_account_signout"]`,
                                bounds: '[40,480][1040,560]',
                                text: 'Sign Out Account',
                                screen: 'settings',
                                clickable: true,
                                enabled: true
                              }, e);
                              setActiveTab('form');
                              toast.info("Signed out of session. Navigated to Form Entry.");
                            }}
                            className="w-full py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Sign Out Account
                          </button>
                        </div>
                      )}

                      {/* VIEW 4: RECORDS & DIAGNOSTICS */}
                      {activeTab !== 'dashboard' && activeTab !== 'catalog' && activeTab !== 'explore' && activeTab !== 'restaurants' && activeTab !== 'home' && activeTab !== 'feed' && activeTab !== 'form' && activeTab !== 'booking' && activeTab !== 'transfer' && activeTab !== 'checkout' && activeTab !== 'login' && activeTab !== 'settings' && activeTab !== 'display' && activeTab !== 'about' && activeTab !== 'profile' && (
                        <div className="space-y-2.5">
                          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">SYSTEM TELEMETRY & RUNTIME STATUS</span>
                            <div className="space-y-2">
                              {[
                                { title: 'Native App Launch', desc: `${appTitle} initialized on Android 14`, time: 'Just now', status: 'Success' },
                                { title: 'Package Manifest Checked', desc: `Launch Activity ${appMeta.launchActivity} verified`, time: '1 min ago', status: 'Complete' },
                                { title: 'UI Automator Driver Attached', desc: 'Appium session running on port 4723', time: '2 mins ago', status: 'Active' }
                              ].map((rec, i) => (
                                <div key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                                  <div>
                                    <h5 className="text-xs font-bold text-white">{rec.title}</h5>
                                    <p className="text-[10px] text-slate-400">{rec.desc}</p>
                                  </div>
                                  <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                                    {rec.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              {/* In-App Mobile Bottom Navigation Bar (BottomNavigationView) */}
              {appMeta.tabs && appMeta.tabs.length > 1 && !inChatRoom && (
                <div 
                  className="px-2 py-2 bg-slate-900/95 border-t border-slate-800/90 flex items-center justify-around z-20 backdrop-blur-md"
                  data-bottom-nav="true"
                >
                  {appMeta.tabs.map((t) => {
                    const isCurrent = (activeTab === t.id);
                    return (
                      <button
                        key={`bnav-${t.id}`}
                        id={`elem-bottom-nav-${t.id}`}
                        onClick={(e) => {
                          setActiveTab(t.id);
                          if (appMeta.archetype === 'saucelabs') {
                            if (t.id === 'catalog') setSauceActiveView('catalog');
                            else if (t.id === 'details') setSauceActiveView('details');
                            else if (t.id === 'cart') setSauceActiveView('cart');
                            else if (t.id === 'checkout') setSauceActiveView('checkout_address');
                            else if (t.id === 'login') setSauceActiveView('login');
                          }
                          if (inChatRoom) setInChatRoom(false);
                          const navElem: MobileElementInfo = {
                            id: `elem-bottom-nav-${t.id}`,
                            name: `Navigation Item: ${t.label}`,
                            type: 'android.widget.BottomNavigationItemView',
                            resourceId: `${pkg}:id/nav_${t.id}`,
                            accessibilityId: t.label,
                            xpath: `//android.widget.BottomNavigationItemView[@content-desc="${t.label}"]`,
                            bounds: '[0,0][0,0]',
                            text: t.label,
                            screen: t.id,
                            clickable: true,
                            enabled: true
                          };
                          handleElementClick(navElem, e);
                        }}
                        className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
                          isCurrent ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                        style={{
                          backgroundColor: isCurrent ? `${appMeta.theme.primary}33` : 'transparent'
                        }}
                      >
                        <div className="relative flex flex-col items-center">
                          <span className={`text-[10px] uppercase tracking-tight ${isCurrent ? 'text-white font-black' : 'text-slate-400 font-semibold'}`}>
                            {t.label}
                          </span>
                          {t.id === 'cart' && appMeta.archetype === 'saucelabs' && sauceCartCount > 0 ? (
                            <span className="absolute -top-1.5 -right-2.5 text-[8px] px-1 rounded-full bg-red-500 text-white font-mono font-black animate-pulse">
                              {sauceCartCount}
                            </span>
                          ) : t.badge ? (
                            <span className="absolute -top-1.5 -right-2 text-[8px] px-1 rounded-full bg-emerald-500 text-white font-mono font-black">
                              {t.badge}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Hardware Bottom Navigation Bar */}
              <div className="px-8 py-2 bg-slate-950 border-t border-slate-900 flex items-center justify-between text-slate-400 z-20">
                <button
                  onClick={() => {
                    if (sauceActiveView !== 'catalog') {
                      setSauceActiveView('catalog');
                      setActiveTab('catalog');
                    } else if (inChatRoom) {
                      setInChatRoom(false);
                    }
                    onRecordElement({
                      id: 'elem-hardware-back',
                      name: 'Hardware Back Key',
                      type: 'android.view.KeyEvent',
                      resourceId: 'android:id/key_back',
                      xpath: '//android.view.KeyEvent[@keyCode="KEYCODE_BACK"]',
                      bounds: '[0,0][0,0]'
                    }, 'click', 'KEYCODE_BACK');
                    toast.info("Hardware Back Key Recorded");
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                  title="Back Key (<)"
                >
                  <ChevronRight size={18} className="rotate-180" />
                </button>
                <button
                  onClick={() => {
                    setSauceActiveView('catalog');
                    setActiveTab(appMeta.defaultTab);
                    setInChatRoom(false);
                    onRecordElement({
                      id: 'elem-hardware-home',
                      name: 'Hardware Home Key',
                      type: 'android.view.KeyEvent',
                      resourceId: 'android:id/key_home',
                      xpath: '//android.view.KeyEvent[@keyCode="KEYCODE_HOME"]',
                      bounds: '[0,0][0,0]'
                    }, 'click', 'KEYCODE_HOME');
                    toast.info("Hardware Home Key Recorded");
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                  title="Home Key (O)"
                >
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-400"></div>
                </button>
                <button
                  onClick={() => {
                    onRecordElement({
                      id: 'elem-hardware-recents',
                      name: 'Hardware Recents Key',
                      type: 'android.view.KeyEvent',
                      resourceId: 'android:id/key_app_switch',
                      xpath: '//android.view.KeyEvent[@keyCode="KEYCODE_APP_SWITCH"]',
                      bounds: '[0,0][0,0]'
                    }, 'click', 'KEYCODE_APP_SWITCH');
                    toast.info("Hardware Recents Key Recorded");
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                  title="Recents Key ([])"
                >
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 rounded-sm"></div>
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT: UI Automator Element Locator Inspector & XML Tree */}
        <div className={`${isFullscreen ? 'lg:col-span-6' : 'lg:col-span-7'} space-y-4`}>
          
          {/* Card 1: Currently Selected Element Inspector */}
          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                  <Target size={16} />
                </div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Inspected Element Locator Details
                </h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                UiAutomator2 Ready
              </span>
            </div>

            {selectedElement ? (
              <div className="space-y-3 animate-in fade-in duration-300">
                
                {/* Element Header */}
                <div className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-xs font-black text-white">{selectedElement.name}</span>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedElement.type}</p>
                  </div>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                    Bounds: {selectedElement.bounds}
                  </span>
                </div>

                {/* Resource-ID */}
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="overflow-hidden">
                    <span className="text-[9px] text-slate-400 font-bold block">RESOURCE ID</span>
                    <span className="text-xs font-mono text-emerald-300 truncate block">{selectedElement.resourceId}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(selectedElement.resourceId, 'Resource ID')}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                    title="Copy Resource ID"
                  >
                    <Copy size={13} />
                  </button>
                </div>

                {/* XPath */}
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="overflow-hidden">
                    <span className="text-[9px] text-slate-400 font-bold block">XPATH</span>
                    <span className="text-xs font-mono text-indigo-300 truncate block">{selectedElement.xpath}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(selectedElement.xpath, 'XPath')}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                    title="Copy XPath"
                  >
                    <Copy size={13} />
                  </button>
                </div>

                {/* Appium / Playwright Code Preview */}
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                    <span>GENERATED APPIUM CODE</span>
                    <button
                      onClick={() => handleCopy(`const el = await driver.elementByXPath("${selectedElement.xpath}");\nawait el.click();`, 'Playwright Snippet')}
                      className="text-[9px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={10} /> Copy Code
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-emerald-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
                    {`const el = await driver.elementByXPath("${selectedElement.xpath}");\nawait el.click();`}
                  </pre>
                </div>

                {/* Quick Action Injections */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => {
                      onRecordElement(selectedElement, 'click', selectedElement.text);
                      toast.success(`[+] Injected Tap on "${selectedElement.name}"`);
                    }}
                    className="py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Plus size={13} /> Tap Step
                  </button>
                  <button
                    onClick={() => {
                      const text = prompt(`Enter text to type into ${selectedElement.name}:`, 'Automated Test Input');
                      if (text) {
                        onRecordElement(selectedElement, 'fill', text);
                        toast.success(`[+] Injected Type "${text}"`);
                      }
                    }}
                    className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} /> Type Step
                  </button>
                  <button
                    onClick={() => {
                      onRecordElement(selectedElement, 'assertion', selectedElement.text || selectedElement.name);
                      toast.success(`[+] Injected Assert Displayed on "${selectedElement.name}"`);
                    }}
                    className="py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Plus size={13} /> Assert Step
                  </button>
                </div>

              </div>
            ) : (
              <div className="py-8 px-4 text-center space-y-2 border-2 border-dashed border-slate-800 rounded-2xl">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                  <Plus size={20} className="stroke-[3]" />
                </div>
                <h5 className="text-xs font-black text-slate-300">No Element Selected</h5>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Click any button, product card, input field, or menu item on the Sauce Labs emulator screen with the <strong className="text-emerald-400 font-bold">'+' cursor</strong> to inspect locators and record steps live!
                </p>
              </div>
            )}
          </div>

          {/* Card 2: Live XML Hierarchy Tree on Screen */}
          <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-indigo-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Screen Element Hierarchy Nodes ({filteredElements.length})
                </h4>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">Tap node to inspect & record</span>
            </div>

            {/* Filter Input */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter nodes by ID, tag, or label..."
                value={hierarchyFilter || ''}
                onChange={(e) => setHierarchyFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>

            {/* Node List */}
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
              {filteredElements.map((elem) => (
                <div
                  key={elem.id}
                  onClick={(e) => handleElementClick(elem, e)}
                  onMouseEnter={() => isInspectorActive && setHoveredElement(elem)}
                  onMouseLeave={() => setHoveredElement(null)}
                  className={`p-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    selectedElement?.id === elem.id
                      ? "bg-emerald-950/60 border-emerald-400/80 text-emerald-300"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  <div className="overflow-hidden pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-black text-[10px]">+</span>
                      <span className="text-xs font-bold truncate">{elem.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 truncate block">
                      {elem.resourceId}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {elem.type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRecordElement(elem, 'click');
                        toast.success(`[+] Recorded Tap on "${elem.name}"`);
                      }}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black flex items-center gap-1 transition-all"
                    >
                      <Plus size={11} /> Tap
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileRecordingInspector;
