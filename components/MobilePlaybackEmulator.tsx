import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wifi, 
  Battery, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Check, 
  Star, 
  ArrowLeft, 
  Menu, 
  Search, 
  Filter, 
  CreditCard, 
  Truck, 
  CheckCircle2, 
  Camera, 
  Calculator, 
  Divide, 
  Percent, 
  History, 
  Delete, 
  Sparkles,
  Smartphone,
  Eye,
  Layers,
  Globe,
  Sliders,
  Send,
  Paperclip,
  Phone,
  Video,
  MessageSquare,
  Activity,
  Heart,
  Share2,
  Bookmark,
  DollarSign,
  Utensils,
  ShoppingBag,
  Bell,
  User,
  Settings,
  ChevronRight,
  ShieldCheck,
  Lock,
  Shield,
  FileText,
  MapPin,
  Zap,
  PhoneCall,
  Mic,
  Square,
  Play,
  Pause,
  MoreVertical,
  Package,
  Download,
  Flame,
  Folder,
  RotateCw,
  Clock,
  SlidersHorizontal,
  Terminal,
  Radio,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import { RecordedStep, RecordedFlow } from '../types';
import { resolveStepTargetMetrics } from './locatorGeometry';
import { detectAppArchetype, getAppMetadata } from '../services/mobileAppDefinitionService';
import { getSauceProductImage, SAUCE_LABS_ASSETS, WDIO_ASSETS, getApkAssets } from '../services/apkExtractorService';

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

export interface MobilePlaybackEmulatorProps {
  flow: RecordedFlow | null;
  currentStepIndex: number;
  playbackStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  playbackSpeed?: number;
  cursorPos: { x: number; y: number };
  isClicking: boolean;
  activeTypingText?: string;
  stepScreenshots?: Record<string, string>;
  viewMode?: 'interactive' | 'screenshot';
  onToggleViewMode?: (mode: 'interactive' | 'screenshot') => void;
  showInteractionOverlay?: boolean;
}

export const MobilePlaybackEmulator: React.FC<MobilePlaybackEmulatorProps> = ({
  flow,
  currentStepIndex,
  playbackStatus,
  playbackSpeed = 1,
  cursorPos,
  isClicking,
  activeTypingText = '',
  stepScreenshots = {},
  viewMode = 'interactive',
  onToggleViewMode,
  showInteractionOverlay = true
}) => {
  const steps = flow?.steps || [];
  const currentStep = (currentStepIndex >= 0 && currentStepIndex < steps.length) ? steps[currentStepIndex] : null;

  // Resolve target package name and archetype
  const packageName = flow?.mobilePackageName || 
    (steps.find(s => s.locator?.primary?.value?.includes('qalculate') || s.elementName?.toLowerCase().includes('calculator')) 
      ? 'com.qalculate.android' 
      : (flow?.name?.toLowerCase().includes('whatsapp') ? 'com.whatsapp' : 'com.saucelabs.mydemoapp.android'));
  
  const appName = flow?.mobileAppName || (packageName.includes('qalculate') ? 'QALculate Mobile App' : (packageName.includes('whatsapp') ? 'WhatsApp' : 'Sauce Labs My Demo App'));
  
  const archetype = useMemo(() => {
    const stepText = steps.map(s => `${s.elementName || ''} ${s.locator?.primary?.value || ''} ${s.value || ''}`).join(' ').toLowerCase();
    if (stepText.includes('qalculate') || stepText.includes('calculator') || stepText.includes('calc') || stepText.includes('key_') || stepText.includes('btn_equals') || stepText.includes('btn_plus')) {
      return 'qalculate';
    }
    return detectAppArchetype(packageName, appName, flow?.name || '');
  }, [packageName, appName, flow, steps]);

  const appMeta = useMemo(() => {
    return getAppMetadata(packageName, appName, undefined, undefined);
  }, [packageName, appName]);

  // Derive dynamic state of the mobile app up to currentStepIndex
  const simulatedAppState = useMemo(() => {
    // 1. Sauce Labs state simulation
    const addedProducts = new Set<string>();
    let cartCount = 0;
    let activeScreen: 'catalog' | 'details' | 'cart' | 'checkout' | 'payment' | 'complete' = 'catalog';
    let selectedProductId = 'backpack';
    let userAddress = { name: '', address: '', city: '', zip: '' };
    let orderPlaced = false;

    // 2. QALculate state simulation
    let formula = '';
    let calcResult = '0';
    let calcHistory: Array<{ formula: string; result: string }> = [];
    let angleMode: 'DEG' | 'RAD' = 'DEG';

    // 3. Chat / Messenger simulation
    const chatMessages: Array<{ text: string; sender: 'me' | 'them'; time: string }> = [
      { text: 'Hi! Let me know if the test cases are ready.', sender: 'them', time: '11:58 AM' },
      { text: 'Running mobile playback automation now...', sender: 'me', time: '11:59 AM' }
    ];

    // 4. Generic App form fields and actions
    const genericFormValues: Record<string, string> = {};
    const clickedButtons = new Set<string>();
    let scrollOffset = 0;

    // Walk through steps up to currentStepIndex
    for (let i = 0; i <= currentStepIndex && i < steps.length; i++) {
      const s = steps[i];
      if (!s) continue;
      const combined = `${s.elementName || ''} ${s.locator?.primary?.value || ''} ${s.value || ''}`.toLowerCase();

      // --- Sauce Labs evaluation ---
      if (combined.includes('backpack') || combined.includes('item_4')) {
        selectedProductId = 'backpack';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('backpack');
        }
      }
      if (combined.includes('bike light') || combined.includes('item_0')) {
        selectedProductId = 'bikelight';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('bikelight');
        }
      }
      if (combined.includes('bolt') || combined.includes('item_1')) {
        selectedProductId = 'bolt_tshirt';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('bolt_tshirt');
        }
      }
      if (combined.includes('onesie') || combined.includes('item_2')) {
        selectedProductId = 'onesie';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('onesie');
        }
      }
      if (combined.includes('fleece') || combined.includes('item_5')) {
        selectedProductId = 'fleece_jacket';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('fleece_jacket');
        }
      }
      if (combined.includes('all_the_things') || combined.includes('item_3')) {
        selectedProductId = 'all_the_things';
        if (combined.includes('add') || s.action === 'click') {
          addedProducts.add('all_the_things');
        }
      }

      // Check view navigation
      if ((combined.includes('shopping_cart') || combined.includes('cart') || combined.includes('basket')) && !combined.includes('add')) {
        activeScreen = 'cart';
      }
      if (combined.includes('checkout') || combined.includes('proceed to checkout')) {
        activeScreen = 'checkout';
      }
      if (combined.includes('continue') && activeScreen === 'checkout') {
        activeScreen = 'payment';
      }
      if (combined.includes('finish') || combined.includes('place order') || combined.includes('pay now')) {
        activeScreen = 'complete';
        orderPlaced = true;
      }
      if (combined.includes('back home') || combined.includes('back to products') || combined.includes('continue shopping')) {
        activeScreen = 'catalog';
      }

      // Fill actions
      if (s.action === 'fill' || s.action === 'type') {
        const fieldKey = s.elementName || s.locator?.primary?.value || `field_${i}`;
        genericFormValues[fieldKey] = s.value || '';

        if (combined.includes('first') || combined.includes('name')) {
          userAddress.name = s.value || 'John Doe';
        }
        if (combined.includes('address') || combined.includes('street')) {
          userAddress.address = s.value || '123 Market St';
        }
        if (combined.includes('city')) {
          userAddress.city = s.value || 'San Francisco';
        }
        if (combined.includes('zip') || combined.includes('postal')) {
          userAddress.zip = s.value || '94105';
        }
        if (archetype === 'whatsapp' && s.value) {
          chatMessages.push({ text: s.value, sender: 'me', time: '12:00 PM' });
        }
      }

      if (s.action === 'click' && s.elementName) {
        clickedButtons.add(s.elementName);
      }

      if (s.action === 'scroll' || (s.action as string) === 'swipe') {
        scrollOffset += 60;
      }

      // --- QALculate evaluation ---
      if (combined.includes('rad') || combined.includes('deg')) {
        angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
      }
      if (combined.includes('clear') || combined.includes('ac') || combined.includes('btn_c')) {
        formula = '';
        calcResult = '0';
      } else if (combined.includes('equals') || combined.includes('btn_equal') || combined.includes('=')) {
        try {
          const cleanF = formula.replace(/×/g, '*').replace(/÷/g, '/');
          const evaluated = Function(`'use strict'; return (${cleanF})`)();
          calcHistory.push({ formula, result: String(evaluated) });
          calcResult = String(evaluated);
          formula = String(evaluated);
        } catch {
          calcResult = '142.50';
        }
      } else {
        const val = s.value || '';
        if (/\d|[+\-×÷*/.]/.test(val)) {
          formula += val;
          calcResult = formula;
        } else if (combined.includes('key_7') || combined.includes('btn_7') || combined.includes('7')) {
          formula += '7';
          calcResult = formula;
        } else if (combined.includes('plus') || combined.includes('add') || combined.includes('+')) {
          formula += ' + ';
          calcResult = formula;
        } else if (combined.includes('key_5') || combined.includes('btn_5') || combined.includes('5')) {
          formula += '5';
          calcResult = formula;
        }
      }
    }

    cartCount = addedProducts.size;
    if (cartCount === 0 && currentStepIndex >= 0) {
      const stepText = (currentStep?.elementName || '') + (currentStep?.locator?.primary?.value || '');
      if (stepText.toLowerCase().includes('cart') || stepText.toLowerCase().includes('add')) {
        cartCount = Math.min(6, currentStepIndex + 1);
      }
    }

    return {
      addedProducts,
      cartCount,
      activeScreen,
      selectedProductId,
      userAddress,
      orderPlaced,
      formula: formula || '128.5 + 14',
      calcResult: calcResult !== '0' ? calcResult : '142.5',
      calcHistory,
      angleMode,
      chatMessages,
      genericFormValues,
      clickedButtons,
      scrollOffset
    };
  }, [steps, currentStepIndex, currentStep, archetype]);

  // Determine active screenshot if available
  const activeScreenshot = currentStep?.screenshot || 
    (currentStep ? stepScreenshots[currentStep.id] : undefined) || 
    (currentStep ? flow?.stepScreenshots?.[currentStep.id] : undefined) ||
    (flow?.screenshots && flow.screenshots[currentStepIndex]) || 
    Object.values(stepScreenshots)[currentStepIndex] ||
    Object.values(flow?.stepScreenshots || {})[currentStepIndex];

  // Target element bounding box for active step
  const targetMetrics = useMemo(() => {
    if (!currentStep) return null;
    return resolveStepTargetMetrics(currentStep, currentStepIndex, steps.length, 'mobile');
  }, [currentStep, currentStepIndex, steps.length]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 select-none">
      
      {/* Device Frame Top HUD & Mode Toggle */}
      <div className="w-full max-w-[340px] flex items-center justify-between gap-2 mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-white font-bold truncate">{appName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeScreenshot && onToggleViewMode && (
            <button
              onClick={() => onToggleViewMode(viewMode === 'interactive' ? 'screenshot' : 'interactive')}
              className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'interactive'
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/40'
                  : 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/40'
              }`}
              title="Toggle between Live Interactive Mirror and Captured Screenshot"
            >
              <Camera size={10} />
              <span>{viewMode === 'interactive' ? 'Live Mirror' : 'Screenshot'}</span>
            </button>
          )}
          <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono">
            {currentStepIndex >= 0 ? `${currentStepIndex + 1}/${steps.length}` : 'Ready'}
          </span>
        </div>
      </div>

      {/* Realistic Android / iOS Mobile Device Container */}
      <div className="w-[300px] sm:w-[320px] h-[520px] sm:h-[540px] rounded-[40px] border-[9px] bg-slate-950 border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] relative overflow-hidden flex flex-col ring-1 ring-slate-700/60">
        
        {/* Dynamic Mobile Status Bar */}
        <div className="h-7 bg-slate-950 text-[10px] font-bold text-slate-300 px-6 flex items-center justify-between z-40 select-none border-b border-slate-900/60">
          <span className="tracking-tight font-mono">12:00 PM</span>
          
          {/* Punch Hole Camera / Dynamic Island */}
          <div className="w-16 h-3 bg-black rounded-full mx-auto flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-800" />
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[8px] font-black text-indigo-400">5G</span>
            <Wifi size={11} className="text-slate-300" />
            <Battery size={13} className="text-emerald-400" fill="currentColor" />
          </div>
        </div>

        {/* Device Display Screen Content */}
        <div className="flex-1 bg-slate-900 relative overflow-hidden flex flex-col">
          
          {/* Mode A: Direct Captured Screenshot View (if mode is set to screenshot and screenshot exists) */}
          {activeScreenshot ? (
            <div className="w-full h-full relative bg-slate-950 flex items-center justify-center overflow-hidden">
              <img
                src={activeScreenshot}
                alt={`Step ${currentStepIndex + 1} Capture`}
                className="w-full h-full object-fill object-top pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : viewMode === 'screenshot' ? (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <Video size={30} className="text-slate-600" />
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Recorded device video unavailable</p>
              <p className="text-[9px] leading-relaxed text-slate-600">Connect the mobile agent and replay or record the flow again to capture real device frames.</p>
            </div>
          ) : archetype === 'qalculate' ? (
            /* ================= ARCHETYPE: QALCULATE ANDROID CALCULATOR ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between p-3 select-none">
              
              {/* QALculate Top Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
                    <Calculator size={14} />
                  </div>
                  <span className="text-xs font-black tracking-wider text-white">QALculate!</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-900 text-indigo-300 border border-slate-800">
                    {simulatedAppState.angleMode}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    REAL
                  </span>
                </div>
              </div>

              {/* LCD Display Canvas */}
              <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 shadow-inner flex flex-col justify-end min-h-[95px] my-2">
                <span className="text-[10px] font-mono text-slate-400 text-right truncate">
                  {simulatedAppState.formula || '0'}
                </span>
                <span className="text-2xl font-black font-mono text-emerald-400 text-right tracking-tight truncate mt-1">
                  {simulatedAppState.calcResult}
                </span>
              </div>

              {/* Scientific & Function Mode Bar */}
              <div className="grid grid-cols-5 gap-1.5 mb-1 text-[10px] font-bold">
                {['RAD', 'sin', 'cos', 'tan', 'π'].map((btn) => (
                  <div 
                    key={btn} 
                    className={`py-1.5 rounded-lg text-center font-mono border transition-all ${
                      btn === simulatedAppState.angleMode 
                        ? 'bg-indigo-600 text-white border-indigo-500' 
                        : 'bg-slate-900/80 text-slate-400 border-slate-800'
                    }`}
                  >
                    {btn}
                  </div>
                ))}
              </div>

              {/* Keypad Matrix Grid */}
              <div className="grid grid-cols-4 gap-1.5 flex-1">
                {[
                  { label: 'C', bg: 'bg-rose-950/60 text-rose-300 border-rose-800/40' },
                  { label: '(', bg: 'bg-slate-800 text-slate-300 border-slate-700' },
                  { label: ')', bg: 'bg-slate-800 text-slate-300 border-slate-700' },
                  { label: '÷', bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50' },
                  
                  { label: '7', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '8', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '9', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '×', bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50' },
                  
                  { label: '4', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '5', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '6', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '-', bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50' },
                  
                  { label: '1', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '2', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '3', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '+', bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50' },
                  
                  { label: '±', bg: 'bg-slate-900 text-slate-400 border-slate-800' },
                  { label: '0', bg: 'bg-slate-900 text-white border-slate-800' },
                  { label: '.', bg: 'bg-slate-900 text-slate-400 border-slate-800' },
                  { label: '=', bg: 'bg-emerald-600 text-white border-emerald-500 font-black shadow-lg shadow-emerald-950' },
                ].map((k) => (
                  <div
                    key={k.label}
                    className={`rounded-xl flex items-center justify-center font-bold text-xs border ${k.bg} transition-all shadow-xs`}
                  >
                    {k.label}
                  </div>
                ))}
              </div>

            </div>
          ) : archetype === 'whatsapp' || archetype === 'social' ? (
            /* ================= ARCHETYPE: WHATSAPP / CHAT MESSENGER ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* WhatsApp App Bar */}
              <div className="px-3.5 py-2 bg-emerald-900 border-b border-emerald-800 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <ArrowLeft size={16} className="text-emerald-200" />
                  <div className="w-7 h-7 rounded-full bg-emerald-700 text-white font-black text-[10px] flex items-center justify-center border border-emerald-500">
                    QA
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">QA Automation Test</h4>
                    <span className="text-[9px] text-emerald-300">online</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-emerald-200">
                  <Video size={14} />
                  <Phone size={14} />
                </div>
              </div>

              {/* Chat Thread Messages */}
              <div className="flex-1 p-3 bg-slate-900 overflow-y-auto space-y-2.5 custom-scrollbar">
                {simulatedAppState.chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                      msg.sender === 'me' ? 'bg-emerald-700 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'
                    }`}>
                      <p>{msg.text}</p>
                      <span className="text-[8px] opacity-70 block text-right mt-0.5">{msg.time}</span>
                    </div>
                  </div>
                ))}
                {activeTypingText && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl px-3 py-2 text-xs bg-emerald-700/80 text-white rounded-br-none border border-emerald-500/40">
                      <p>{activeTypingText}<span className="inline-block w-1.5 h-3 bg-white ml-0.5 animate-pulse" /></p>
                      <span className="text-[8px] opacity-70 block text-right mt-0.5">Typing...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Message Input Box */}
              <div className="p-2 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
                <div className="flex-1 bg-slate-900 rounded-full px-3.5 py-1.5 text-xs text-white border border-slate-800 flex items-center gap-2">
                  <span className="text-slate-400">{activeTypingText || 'Type a message...'}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-md">
                  <Send size={13} />
                </div>
              </div>
            </div>
          ) : archetype === 'wdio' ? (
            /* ================= ARCHETYPE: WEBDRIVERIO NATIVE DEMO APP ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* WDIO Top App Bar */}
              <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <img 
                    src={WDIO_ASSETS.icon} 
                    alt="WDIO" 
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-lg object-contain bg-slate-950 p-0.5 border border-slate-800"
                  />
                  <div>
                    <h4 className="text-xs font-black text-white leading-tight">WEBDRIVER.IO</h4>
                    <span className="text-[8px] font-mono text-orange-400">Native Demo App</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Active Step #{currentStepIndex + 1}
                  </span>
                </div>
              </div>

              {/* Dynamic Screen View based on step action */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {/* Hero Mascot robot display */}
                <div className="p-3.5 bg-gradient-to-b from-orange-950/40 via-slate-900 to-slate-950 rounded-2xl border border-orange-500/30 text-center space-y-1.5 shadow-lg">
                  <div className="w-16 h-16 mx-auto relative flex items-center justify-center">
                    <img 
                      src={WDIO_ASSETS.robot_logo} 
                      alt="WDIO Robot" 
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 object-contain drop-shadow-[0_0_12px_rgba(234,89,6,0.6)]"
                    />
                  </div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    WEBDRIVER<span className="text-orange-500">.IO</span>
                  </h3>
                  <p className="text-[10px] text-slate-300">
                    Automated Native Android Execution
                  </p>
                </div>

                {/* Live Form / Active Step Simulation */}
                <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-400 uppercase">
                    <span>Active Target: {currentStep?.elementName || 'Component'}</span>
                    <span className="text-orange-400">{currentStep?.action || 'click'}</span>
                  </div>

                  {activeTypingText || currentStep?.value ? (
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-between">
                      <span>{activeTypingText || currentStep?.value}</span>
                      <span className="w-1.5 h-3 bg-orange-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 truncate">
                      {currentStep?.locator?.primary?.value || 'Target Element Active'}
                    </div>
                  )}

                  {/* Quick Form Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <div className="py-2 bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase text-center shadow">
                      {currentStep?.action === 'click' ? 'TAPPED' : 'ACTIVE'}
                    </div>
                    <div className="py-2 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-bold uppercase text-center border border-slate-700">
                      INSPECTOR
                    </div>
                  </div>
                </div>
              </div>

              {/* WDIO Bottom Navigation Tabs */}
              <div className="h-11 bg-slate-950 border-t border-slate-800 flex items-center justify-around text-slate-400">
                {[
                  { label: 'Home', icon: Smartphone, active: true },
                  { label: 'Webview', icon: Globe },
                  { label: 'Login', icon: User },
                  { label: 'Forms', icon: CheckCircle2 },
                  { label: 'Swipe', icon: Layers },
                  { label: 'Drag', icon: Sliders },
                ].map((t) => (
                  <div key={t.label} className={`flex flex-col items-center gap-0.5 ${t.active ? 'text-orange-500' : 'text-slate-400'}`}>
                    <t.icon size={12} />
                    <span className="text-[7px] font-black uppercase">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : archetype === 'saucelabs' ? (
            /* ================= ARCHETYPE: SAUCE LABS SWAG DEMO STORE ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              
              {/* Sauce Labs App Top Navigation Header */}
              <div className="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800/90 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                    <Menu size={14} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <img 
                      src={SAUCE_LABS_ASSETS.swag_header_logo || SAUCE_LABS_ASSETS.icon} 
                      alt="Swag Labs"
                      referrerPolicy="no-referrer"
                      className="h-5 w-auto max-w-[100px] object-contain drop-shadow"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="text-xs font-black tracking-tight text-white uppercase drop-shadow">SWAG LABS</span>
                  </div>
                </div>

                {/* Shopping Cart Button & Dynamic Badge Counter */}
                <div className="relative p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200">
                  <ShoppingCart size={15} />
                  {simulatedAppState.cartCount > 0 && (
                    <motion.span 
                      key={`cart-badge-${simulatedAppState.cartCount}`}
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center border border-slate-950 shadow-md"
                    >
                      {simulatedAppState.cartCount}
                    </motion.span>
                  )}
                </div>
              </div>

              {/* View Router based on active step context */}
              {simulatedAppState.activeScreen === 'complete' ? (
                /* Checkout Completed Screen */
                <div className="flex-1 p-5 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-950 animate-bounce">
                    <CheckCircle2 size={30} />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">THANK YOU FOR YOUR ORDER!</h3>
                  <p className="text-[10px] text-slate-400 leading-relaxed px-2">
                    Your mock order has been dispatched via Sauce Labs test automation pipeline.
                  </p>
                  <div className="w-full pt-2">
                    <div className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider text-center">
                      BACK HOME
                    </div>
                  </div>
                </div>
              ) : simulatedAppState.activeScreen === 'checkout' || simulatedAppState.activeScreen === 'payment' ? (
                /* Checkout Form Screen */
                <div className="flex-1 p-3.5 flex flex-col justify-between overflow-y-auto custom-scrollbar space-y-2">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-400 mb-2">
                      <Truck size={12} /> Checkout: Your Information
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-0.5">
                        <label className="text-[9px] text-slate-400 uppercase font-bold">First Name</label>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white">
                          {simulatedAppState.userAddress.name || activeTypingText || 'John'}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[9px] text-slate-400 uppercase font-bold">Last Name</label>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white">
                          Doe
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[9px] text-slate-400 uppercase font-bold">Zip / Postal Code</label>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white">
                          94105
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider text-center">
                    CONTINUE TO PAYMENT
                  </div>
                </div>
              ) : (
                /* Default Catalog Grid View */
                <div className="flex-1 p-3 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
                  
                  {/* Catalog Filter & Heading */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                      PRODUCTS ({SAUCE_PRODUCTS.length})
                    </span>
                    <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-400 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                      <Filter size={10} /> Name (A to Z)
                    </div>
                  </div>

                  {/* Product Cards List */}
                  <div className="grid grid-cols-1 gap-2">
                    {SAUCE_PRODUCTS.map((prod) => {
                      const isAdded = simulatedAppState.addedProducts.has(prod.id);
                      return (
                        <div 
                          key={prod.id}
                          className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2.5 ${
                            isAdded 
                              ? 'bg-slate-900/90 border-emerald-500/40 ring-1 ring-emerald-500/30' 
                              : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-1 shrink-0 shadow-md overflow-hidden">
                            <img 
                              src={getSauceProductImage(prod.id)} 
                              alt={prod.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain drop-shadow"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{prod.name}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-black text-emerald-400 font-mono">${prod.price}</span>
                              <div className="flex items-center text-[9px] text-amber-400">
                                <Star size={9} fill="currentColor" /> {prod.rating}
                              </div>
                            </div>
                          </div>

                          <div 
                            className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0 transition-all ${
                              isAdded 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                          >
                            {isAdded ? 'ADDED' : 'ADD TO CART'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

            </div>
          ) : archetype === 'health_insurance' ? (
            /* ================= ARCHETYPE: HEALTH INSURANCE (NIVA BUPA CARE) ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* Niva Bupa App Header */}
              {(() => {
                const apkAssets = getApkAssets(packageName);
                const appTitle = apkAssets?.appName || appName || 'Niva Bupa Health';
                return (
                  <div className="px-3.5 py-2.5 bg-teal-950 border-b border-teal-800 flex items-center justify-between shrink-0 shadow-md">
                    <div className="flex items-center gap-2">
                      {apkAssets?.icon ? (
                        <img 
                          src={apkAssets.icon} 
                          alt="App Icon" 
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-xl object-contain drop-shadow bg-slate-950 p-0.5 border border-teal-500/40" 
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                          <Shield size={15} />
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-black text-white uppercase tracking-tight block">{appTitle}</span>
                        <span className="text-[8px] font-mono text-teal-300 block">Policy: NIVA-8849204-IND</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        CASHLESS
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Dynamic Health Insurance Screen Body */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {/* Policy Cover Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-teal-900 to-slate-900 border border-teal-500/40 space-y-1.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                      REASSURE 2.0 TITANIUM
                    </span>
                    <span className="text-[10px] text-teal-400 font-mono font-bold">COVER: ₹10,00,000</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-lg font-black text-white">Alex Johnson</span>
                    <span className="text-[10px] text-emerald-400 font-bold">● Pre-Auth Active</span>
                  </div>
                </div>

                {/* Live Step Tracker Action Box */}
                <div className="p-3 bg-slate-900 rounded-2xl border border-teal-500/30 space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-teal-400 uppercase">
                    <span>Target: {currentStep?.elementName || 'Insurance Component'}</span>
                    <span>Step #{currentStepIndex + 1}</span>
                  </div>

                  {activeTypingText || currentStep?.value ? (
                    <div className="p-2 bg-slate-950 rounded-xl border border-teal-500/30 text-xs font-mono text-emerald-400 flex items-center justify-between">
                      <span>{activeTypingText || currentStep?.value}</span>
                      <span className="w-1.5 h-3 bg-teal-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 truncate">
                      {currentStep?.locator?.primary?.value || 'Intimate Cashless Claim'}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <div className="py-2 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase text-center shadow">
                      {currentStep?.action === 'click' ? 'TAPPED' : 'ACTIVE'}
                    </div>
                    <div className="py-2 bg-slate-800 text-teal-300 rounded-xl text-[10px] font-bold uppercase text-center border border-teal-500/30">
                      30-MIN SLA
                    </div>
                  </div>
                </div>

                {/* Quick Network Hospitals */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Nearby Cashless Hospitals</span>
                  <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Max Super Speciality Saket</div>
                      <div className="text-[9px] text-teal-400">1.2 km • 24 ICUs Available</div>
                    </div>
                    <span className="text-[9px] text-emerald-400 font-bold">CASHLESS DESK</span>
                  </div>
                </div>
              </div>

              {/* Health Insurance Navigation Tabs */}
              <div className="h-10 bg-slate-950 border-t border-teal-900/50 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-teal-400">
                  <Shield size={13} />
                  <span className="text-[7px] font-black uppercase">Policy</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <FileText size={13} />
                  <span className="text-[7px] font-black uppercase">Claims</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <MapPin size={13} />
                  <span className="text-[7px] font-black uppercase">Hospitals</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Activity size={13} />
                  <span className="text-[7px] font-black uppercase">Vitals</span>
                </div>
              </div>
            </div>
          ) : archetype === 'machaxi' ? (
            /* ================= ARCHETYPE: MACHAXI SPORTS & ARENAS ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              <div className="px-3.5 py-2.5 bg-indigo-950 border-b border-indigo-800 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                    <Activity size={15} />
                  </div>
                  <div>
                    <span className="text-xs font-black text-white uppercase tracking-tight block">Machaxi Sports</span>
                    <span className="text-[8px] font-mono text-indigo-300 block">HSR Arena • 8 BWF Courts</span>
                  </div>
                </div>
                <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300">
                  SLOTS OPEN
                </span>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                <div className="p-3 bg-slate-900 rounded-2xl border border-indigo-500/30 space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-indigo-400 uppercase">
                    <span>Target: {currentStep?.elementName || 'Court Booking'}</span>
                    <span>Step #{currentStepIndex + 1}</span>
                  </div>
                  {activeTypingText || currentStep?.value ? (
                    <div className="p-2 bg-slate-950 rounded-xl border border-indigo-500/30 text-xs font-mono text-emerald-400">
                      {activeTypingText || currentStep?.value}
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                      {currentStep?.locator?.primary?.value || 'Select Badminton Court Slot'}
                    </div>
                  )}
                  <div className="py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase text-center shadow">
                    {currentStep?.action === 'click' ? 'TAPPED' : 'ACTIVE'}
                  </div>
                </div>
              </div>

              <div className="h-10 bg-slate-950 border-t border-indigo-900/50 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-indigo-400">
                  <Activity size={13} />
                  <span className="text-[7px] font-black uppercase">Arenas</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <User size={13} />
                  <span className="text-[7px] font-black uppercase">Bookings</span>
                </div>
              </div>
            </div>
          ) : archetype === 'sound_recorder' ? (
            /* ================= ARCHETYPE: SOUND RECORDER (DANIEL KIM) ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* Material Red App Header Toolbar */}
              <div className="px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <Mic size={18} className="text-white drop-shadow" />
                  <div>
                    <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">{appName || 'Sound Recorder'}</h4>
                    <span className="text-[8px] font-mono text-red-100 block">v1.3.0 High-Fidelity Audio</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-black/20 text-white border border-white/20">
                    Step #{currentStepIndex + 1}
                  </span>
                  <MoreVertical size={15} className="text-white" />
                </div>
              </div>

              {/* Tab Navigation Bars: RECORD / SAVED RECORDINGS */}
              <div className="bg-slate-900 border-b border-slate-800 flex items-center text-xs font-black">
                {(() => {
                  const isSavedTab = currentStep?.elementName?.toLowerCase().includes('saved') || 
                                     currentStep?.locator?.primary?.value?.toLowerCase().includes('saved') ||
                                     currentStep?.locator?.primary?.value?.toLowerCase().includes('recording');
                  return (
                    <>
                      <div className={`flex-1 py-2.5 text-center uppercase tracking-wider transition-all border-b-2 ${
                        !isSavedTab ? 'text-red-400 border-red-500 bg-red-950/20' : 'text-slate-400 border-transparent'
                      }`}>
                        RECORD
                      </div>
                      <div className={`flex-1 py-2.5 text-center uppercase tracking-wider transition-all border-b-2 ${
                        isSavedTab ? 'text-red-400 border-red-500 bg-red-950/20' : 'text-slate-400 border-transparent'
                      }`}>
                        SAVED RECORDINGS
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Main Dynamic Workspace during test playback */}
              <div className="flex-1 p-4 flex flex-col items-center justify-between overflow-y-auto custom-scrollbar">
                {/* Active Step Target Info Card */}
                <div className="w-full p-2.5 bg-slate-900 rounded-2xl border border-red-500/30 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-red-400 uppercase">
                    <span className="truncate max-w-[180px]">Target: {currentStep?.elementName || 'Sound Recorder Component'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">{currentStep?.action || 'tap'}</span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-mono truncate">
                    {currentStep?.locator?.primary?.value || 'com.danielkim.soundrecorder:id/btnRecord'}
                  </div>
                </div>

                {/* Big Visual Chronometer Counter */}
                <div className="relative flex items-center justify-center my-auto">
                  {currentStep?.action === 'click' && (
                    <div className="absolute w-44 h-44 rounded-full border-2 border-red-500/40 animate-ping" />
                  )}
                  <div className="w-40 h-40 rounded-full border-2 border-red-400/80 bg-slate-900/80 flex flex-col items-center justify-center shadow-xl shadow-red-950/30">
                    <span className="text-3xl font-black font-mono tracking-wider text-white">
                      00:58
                    </span>
                    <span className="text-[9px] text-red-400 font-bold tracking-widest uppercase mt-1">
                      {currentStep?.action === 'click' ? '● RECORDING' : 'AUDIO READY'}
                    </span>
                  </div>
                </div>

                {/* Floating Action Button (FAB) Record Trigger */}
                <div className="pt-2 flex flex-col items-center gap-1.5">
                  <p className="text-[11px] font-bold text-slate-300">
                    {currentStep?.action === 'click' ? 'Recording in progress...' : 'Tap the button to start recording'}
                  </p>
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center text-white shadow-xl shadow-red-900/50 ring-4 ring-red-500/30 transform hover:scale-105">
                    {currentStep?.action === 'click' ? (
                      <Square size={22} className="fill-white" />
                    ) : (
                      <Mic size={26} />
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom System Navigation */}
              <div className="h-9 bg-slate-950 border-t border-slate-900 flex items-center justify-around text-slate-500 text-[10px] font-mono">
                <span>44.1 kHz</span>
                <span>•</span>
                <span>AAC Stereo</span>
                <span>•</span>
                <span>192 kbps</span>
              </div>
            </div>
          ) : archetype === 'apidemos' ? (
            /* ================= ARCHETYPE: API DEMOS (IO.APPIUM.ANDROID.APIS) ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* Android Action Bar */}
              <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-blue-900/50 text-white">
                    <Smartphone size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">API Demos</h4>
                    <span className="text-[8px] font-mono text-blue-200 block">io.appium.android.apis</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-black/20 text-white border border-white/20">
                    Step #{currentStepIndex + 1}
                  </span>
                </div>
              </div>

              {/* Dynamic Sub-View / Controls Container */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 custom-scrollbar">
                {/* Active Target Banner */}
                <div className="p-2.5 bg-slate-900 rounded-xl border border-blue-500/40 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-blue-400 uppercase">
                    <span className="truncate max-w-[180px]">Target: {currentStep?.elementName || 'ApiDemos Element'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">{currentStep?.action || 'tap'}</span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-mono truncate">
                    {currentStep?.locator?.primary?.value || 'android:id/text1'}
                  </div>
                </div>

                {/* API Demos Sample List or Controls view */}
                <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-2xl border border-slate-800">
                  <div className="px-1.5 py-0.5 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <span>DEMO MENU & VIEWS</span>
                    <span className="text-blue-400 font-mono">AUTOMATION</span>
                  </div>
                  {[
                    'Accessibility', 'Animation', 'App', 'Content', 'Graphics', 
                    'Media', 'NFC', 'OS', 'Preference', 'Text', 'Views', 'Buttons', 'Controls'
                  ].map((item, idx) => {
                    const isTarget = currentStep?.elementName?.toLowerCase().includes(item.toLowerCase()) ||
                                     currentStep?.locator?.primary?.value?.toLowerCase().includes(item.toLowerCase()) ||
                                     (idx === (currentStepIndex % 10));
                    return (
                      <div
                        key={item}
                        className={`px-3 py-2 rounded-xl border transition-all flex items-center justify-between ${
                          isTarget 
                            ? 'bg-blue-950/80 border-blue-500 text-white ring-1 ring-blue-500/40 shadow-sm' 
                            : 'bg-slate-950/90 border-slate-800/80 text-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold">{item}</span>
                        <ChevronRight size={13} className={isTarget ? 'text-blue-400' : 'text-slate-600'} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Hardware Navigation Bar */}
              <div className="h-10 bg-slate-950 border-t border-slate-800 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-blue-400">
                  <Smartphone size={13} />
                  <span className="text-[7px] font-black uppercase">Demos</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Activity size={13} />
                  <span className="text-[7px] font-black uppercase">Views</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Search size={13} />
                  <span className="text-[7px] font-black uppercase">Find</span>
                </div>
              </div>
            </div>
          ) : archetype === 'fdroid' ? (
            /* ================= ARCHETYPE: F-DROID OPEN SOURCE APP STORE ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* F-Droid App Header Toolbar */}
              <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shrink-0 shadow-md border-b border-blue-600/40">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-950/80 border border-blue-400/40 flex items-center justify-center p-0.5 shadow-inner">
                    <Package size={15} className="text-blue-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-wide text-white drop-shadow-xs">F-Droid</h4>
                    <span className="text-[8px] font-mono text-blue-200 block">org.fdroid.fdroid</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="p-1.5 rounded-lg bg-blue-900/60 text-blue-200">
                    <RotateCw size={12} />
                  </div>
                  <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-black/30 text-emerald-300 border border-emerald-400/30">
                    FOSS
                  </span>
                </div>
              </div>

              {/* F-Droid Body Content */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 custom-scrollbar">
                {/* Search Bar */}
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={activeTypingText || ''}
                    placeholder="Search apps, tools & utilities..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500"
                  />
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>

                {/* Hero Featured App */}
                <div className="p-3 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-blue-950/80 rounded-2xl border border-indigo-500/30 shadow-md">
                  <div className="flex items-center justify-between text-[8px] font-black uppercase text-indigo-400 mb-1">
                    <span>FEATURED APP</span>
                    <span className="text-emerald-400 font-mono">v0.27.0</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center text-white font-bold text-sm shadow">
                      N
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white">NewPipe</h4>
                      <p className="text-[10px] text-slate-300 line-clamp-1">Lightweight YouTube frontend</p>
                    </div>
                  </div>
                </div>

                {/* Section Header */}
                <div className="flex items-center justify-between px-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                  <span>AVAILABLE PACKAGES</span>
                  <span className="text-blue-400 font-mono">REPOSITORY SYNCED</span>
                </div>

                {/* Sample App Rows */}
                {[
                  { name: 'VLC for Android', id: 'org.videolan.vlc', author: 'VideoLAN', ver: '3.5.4', size: '28 MB', bg: 'from-amber-600 to-orange-700' },
                  { name: 'Fennec F-Droid', id: 'org.mozilla.fennec_fdroid', author: 'Mozilla', ver: '124.0', size: '64 MB', bg: 'from-orange-600 to-amber-700' },
                  { name: 'Termux', id: 'com.termux', author: 'Fredrik Fornwall', ver: '0.118.0', size: '97 MB', bg: 'from-slate-800 to-slate-950' },
                  { name: 'K-9 Mail', id: 'com.fsck.k9', author: 'Thunderbird Team', ver: '6.800', size: '14 MB', bg: 'from-cyan-600 to-blue-700' }
                ].map(app => (
                  <div key={app.id} className="p-2.5 bg-slate-900/90 rounded-2xl border border-slate-800 flex items-center justify-between gap-2 shadow-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${app.bg} flex items-center justify-center text-white font-bold text-xs shrink-0 shadow`}>
                        {app.name.charAt(0)}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="text-xs font-bold text-white truncate">{app.name}</h4>
                        <p className="text-[9px] text-slate-400 truncate">{app.author} • {app.size}</p>
                      </div>
                    </div>
                    <button className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shrink-0">
                      INSTALL
                    </button>
                  </div>
                ))}
              </div>

              {/* Bottom F-Droid Bar */}
              <div className="h-10 bg-slate-950 border-t border-slate-800 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-blue-400 font-bold">
                  <Flame size={13} />
                  <span className="text-[7px] uppercase">Latest</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Folder size={13} />
                  <span className="text-[7px] uppercase">Categories</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <RotateCw size={13} />
                  <span className="text-[7px] uppercase">Updates</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <SlidersHorizontal size={13} />
                  <span className="text-[7px] uppercase">Settings</span>
                </div>
              </div>
            </div>
          ) : archetype === 'malarm' ? (
            /* ================= ARCHETYPE: MALARM MINIMALIST ALARM CLOCK ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* Header */}
              <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow">
                    <Clock size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white">Malarm</h4>
                    <span className="text-[8px] font-mono text-slate-400">com.vlyashuk.malarm</span>
                  </div>
                </div>
                <span className="text-[8px] px-2 py-0.5 rounded-full font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ACTIVE
                </span>
              </div>

              {/* Body */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {/* Clock Banner */}
                <div className="p-4 bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border border-slate-800 text-center space-y-1 shadow-inner">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">System Time</span>
                  <div className="text-3xl font-black text-white font-mono tracking-tight flex items-baseline justify-center gap-1.5">
                    <span>08:26</span>
                    <span className="text-xs font-bold text-amber-400">AM</span>
                  </div>
                  <p className="text-[10px] text-emerald-400 font-mono">
                    Next alarm in 14h 4m
                  </p>
                </div>

                {/* Alarm Cards */}
                <div className="space-y-2">
                  <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black font-mono text-white">07:00</span>
                        <span className="text-[10px] font-black text-amber-400">AM</span>
                      </div>
                      <span className="text-[10px] text-slate-300 block">Morning Standup</span>
                      <span className="text-[8px] font-mono text-slate-400">Mon, Tue, Wed, Thu, Fri</span>
                    </div>
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-amber-500" readOnly />
                  </div>

                  <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-850 flex items-center justify-between opacity-60">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black font-mono text-white">09:30</span>
                        <span className="text-[10px] font-black text-amber-400">AM</span>
                      </div>
                      <span className="text-[10px] text-slate-300 block">Weekend Workout</span>
                      <span className="text-[8px] font-mono text-slate-400">Sat, Sun</span>
                    </div>
                    <input type="checkbox" className="w-4 h-4 rounded accent-amber-500" readOnly />
                  </div>
                </div>

                <div className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-wider text-center shadow-lg shadow-amber-950">
                  + ADD NEW ALARM
                </div>
              </div>

              {/* Bottom malarm bar */}
              <div className="h-9 bg-slate-950 border-t border-slate-900 flex items-center justify-around text-slate-500 text-[10px] font-mono">
                <span>Malarm v1.4.0</span>
                <span>•</span>
                <span>Exact Alarms Enabled</span>
              </div>
            </div>
          ) : archetype === 'education' ? (
            /* ================= ARCHETYPE: HIGHER EDUCATION / MILES EDUCATION ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* Miles Education App Header */}
              {(() => {
                const apkAssets = getApkAssets(packageName);
                const appTitle = apkAssets?.appName || appName || 'Miles Education';
                return (
                  <div className="px-3.5 py-2.5 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-blue-800 flex items-center justify-between shrink-0 shadow-md">
                    <div className="flex items-center gap-2">
                      {apkAssets?.icon ? (
                        <img 
                          src={apkAssets.icon} 
                          alt="App Icon" 
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-xl object-contain drop-shadow bg-slate-950 p-0.5 border border-blue-500/40" 
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                          <GraduationCap size={15} />
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-black text-white uppercase tracking-tight block">{appTitle}</span>
                        <span className="text-[8px] font-mono text-blue-300 block">US CPA • CMA • ACCA Global</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        AICPA CERTIFIED
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Education Screen Body */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {/* Hero Certification Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 border border-blue-500/40 space-y-1.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      FLAGSHIP CPA PROGRAM
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">100% PLACEMENT</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-base font-black text-white">US CPA Master Class</span>
                    <span className="text-[10px] text-blue-300 font-bold">4 Sections (AUD, FAR, REG, TCP)</span>
                  </div>
                </div>

                {/* Live Step Tracker Action Box */}
                <div className="p-3 bg-slate-900 rounded-2xl border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-blue-400 uppercase">
                    <span>Target: {currentStep?.elementName || 'Education Course Element'}</span>
                    <span>Step #{currentStepIndex + 1}</span>
                  </div>

                  {activeTypingText || currentStep?.value ? (
                    <div className="p-2 bg-slate-950 rounded-xl border border-blue-500/30 text-xs font-mono text-emerald-400 flex items-center justify-between">
                      <span>{activeTypingText || currentStep?.value}</span>
                      <span className="w-1.5 h-3 bg-blue-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 truncate">
                      {currentStep?.locator?.primary?.value || 'Start Lecture / Take Mock Exam'}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <div className="py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase text-center shadow">
                      {currentStep?.action === 'click' ? 'TAPPED' : 'ACTIVE'}
                    </div>
                    <div className="py-2 bg-slate-800 text-blue-300 rounded-xl text-[10px] font-bold uppercase text-center border border-blue-500/30">
                      LIVE CLASSROOM
                    </div>
                  </div>
                </div>

                {/* Popular Programs List */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">Top Programs & Certifications</span>
                  {[
                    { name: 'US CPA Master Program', code: 'AICPA / Becker', price: '₹1,25,000', badge: 'ENROLLED' },
                    { name: 'US CMA Global Fast-Track', code: 'IMA Approved', price: '₹95,000', badge: 'POPULAR' },
                    { name: 'ACCA Global Pathway', code: '9 Paper Exemption', price: '₹85,000', badge: 'CAREER' }
                  ].map((c, i) => (
                    <div key={i} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">{c.name}</div>
                        <div className="text-[9px] text-blue-400 font-mono">{c.code} • {c.price}</div>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30">{c.badge}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Education Bottom Navigation Tabs */}
              <div className="h-10 bg-slate-950 border-t border-blue-900/50 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-blue-400">
                  <BookOpen size={13} />
                  <span className="text-[7px] font-black uppercase">Programs</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Play size={13} />
                  <span className="text-[7px] font-black uppercase">Classroom</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <CheckCircle2 size={13} />
                  <span className="text-[7px] font-black uppercase">Mock Exam</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <User size={13} />
                  <span className="text-[7px] font-black uppercase">Student Hub</span>
                </div>
              </div>
            </div>
          ) : (
            /* ================= ARCHETYPE: DYNAMIC UNIVERSAL MOBILE APPLICATION ================= */
            <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
              {/* App Bar with Real APK Icon */}
              {(() => {
                const apkAssets = getApkAssets(packageName);
                return (
                  <div className="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md">
                    <div className="flex items-center gap-2">
                      {apkAssets?.icon ? (
                        <img 
                          src={apkAssets.icon} 
                          alt="App Icon"
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-xl object-contain drop-shadow bg-slate-900 p-0.5 border border-slate-800" 
                        />
                      ) : (
                        <div className="p-1.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                          <Smartphone size={14} />
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-black text-white uppercase tracking-tight block">{apkAssets?.appName || appName}</span>
                        <span className="text-[8px] font-mono text-slate-400 block truncate max-w-[150px]">{packageName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {apkAssets?.allImages?.length ? (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300">
                          {apkAssets.allImages.length} ASSETS
                        </span>
                      ) : null}
                      <div className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                        <Search size={13} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Dynamic Interactive Screen Workspace */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                {/* Search / Filter Bar */}
                <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Search size={13} className="text-indigo-400" />
                    <span>{activeTypingText || 'Search in application...'}</span>
                  </div>
                  <Filter size={12} />
                </div>

                {/* Dynamic Screen Action Elements matching recorded steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider px-1">
                    <span>Active Screen Elements</span>
                    <span className="text-indigo-400 font-mono">Step #{currentStepIndex + 1}</span>
                  </div>

                  {steps.slice(0, Math.max(3, currentStepIndex + 2)).map((s, idx) => {
                    const isCurrent = idx === currentStepIndex;
                    const isInput = s.action === 'fill' || s.action === 'type';
                    const elName = s.elementName || s.locator?.primary?.value || `Element ${idx + 1}`;
                    
                    return (
                      <div 
                        key={s.id || idx}
                        className={`p-2.5 rounded-2xl border transition-all ${
                          isCurrent 
                            ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/40 text-white' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="font-bold truncate text-white">{elName}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                            isInput ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {s.action}
                          </span>
                        </div>

                        {isInput ? (
                          <div className="bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 flex items-center justify-between">
                            <span>{isCurrent && activeTypingText ? activeTypingText : (s.value || 'Input value')}</span>
                            {isCurrent && <span className="w-1.5 h-3 bg-indigo-400 animate-pulse" />}
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-400 font-mono truncate">
                            {s.locator?.primary?.value || 'locator: auto-detected'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* General Actions Button Bar */}
                <div className="pt-2">
                  <div className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider text-center shadow-lg shadow-indigo-950">
                    {currentStep?.action === 'click' ? `Click: ${currentStep.elementName || 'Submit'}` : 'Continue Action'}
                  </div>
                </div>
              </div>

              {/* Bottom Mobile Navigation Tabs */}
              <div className="h-10 bg-slate-950 border-t border-slate-800 flex items-center justify-around text-slate-400">
                <div className="flex flex-col items-center gap-0.5 text-indigo-400">
                  <Smartphone size={13} />
                  <span className="text-[7px] font-black uppercase">Home</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Search size={13} />
                  <span className="text-[7px] font-black uppercase">Search</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Activity size={13} />
                  <span className="text-[7px] font-black uppercase">Activity</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <User size={13} />
                  <span className="text-[7px] font-black uppercase">Profile</span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Bounding Box Overlay for Active Step Target */}
          {showInteractionOverlay && targetMetrics && (
            <motion.div
              key={`mobile-target-box-${currentStepIndex}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{
                left: `${targetMetrics.targetBox.x}%`,
                top: `${targetMetrics.targetBox.y}%`,
                width: `${targetMetrics.targetBox.width}%`,
                height: `${targetMetrics.targetBox.height}%`,
              }}
              className={`absolute rounded-md border-2 pointer-events-none transition-all duration-200 z-30 ${
                ['fill', 'type'].includes(currentStep?.action || '')
                  ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                  : 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.8)] ring-2 ring-emerald-400/40'
              } flex items-start justify-between p-1 overflow-hidden`}
            >
              <div className="w-full flex items-center justify-between text-[8px] font-black text-white">
                <span className={`px-1.5 py-0.5 rounded uppercase truncate max-w-[90px] shadow ${
                  ['fill', 'type'].includes(currentStep?.action || '') ? 'bg-indigo-600' : 'bg-emerald-600'
                }`}>
                  {currentStep?.action}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  ['fill', 'type'].includes(currentStep?.action || '') ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400 animate-ping'
                } shrink-0`} />
              </div>
            </motion.div>
          )}

          {/* Animated Virtual Mobile Touch Pointer & Tap Wave Ripple */}
          {showInteractionOverlay && currentStepIndex >= 0 && (
            <motion.div
              animate={{
                left: `${cursorPos.x}%`,
                top: `${cursorPos.y}%`,
              }}
              transition={{
                duration: Math.max(0.08, 0.28 / playbackSpeed),
                ease: 'easeInOut',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
            >
              <div className="relative flex items-center justify-center">
                {/* Translucent Touch Ring */}
                <div className="w-9 h-9 rounded-full bg-indigo-500/40 border-2 border-white flex items-center justify-center shadow-lg shadow-indigo-950/80">
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                </div>

                {/* Expanding Tap Ripple on Click */}
                <AnimatePresence>
                  {isClicking && (
                    <motion.div
                      initial={{ scale: 0.2, opacity: 1 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                      className="absolute w-14 h-14 rounded-full border-4 border-emerald-400 bg-emerald-500/30 shadow-[0_0_25px_rgba(52,211,153,0.9)]"
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </div>

        {/* Bottom Android Gesture Navigation Bar */}
        <div className="h-5 bg-slate-950 flex items-center justify-center z-40 border-t border-slate-900 select-none">
          <div className="w-24 h-1 bg-slate-600/80 rounded-full" />
        </div>

      </div>

    </div>
  );
};
