import { MobileElementInfo } from '../components/MobileRecordingInspector';

export type AppArchetype = 
  | 'saucelabs'
  | 'wdio'
  | 'qalculate'
  | 'sound_recorder'
  | 'malarm'
  | 'fdroid'
  | 'apidemos'
  | 'health_insurance'
  | 'education'
  | 'whatsapp' 
  | 'chrome' 
  | 'settings' 
  | 'machaxi' 
  | 'food_delivery' 
  | 'ecommerce' 
  | 'finance' 
  | 'social' 
  | 'generic';

export interface AppTabDefinition {
  id: string;
  label: string;
  badge?: string | number;
}

export interface AppTheme {
  primary: string;
  primaryHover: string;
  accent: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  buttonBg: string;
}

export interface AppMetadata {
  archetype: AppArchetype;
  displayName: string;
  packageName: string;
  launchActivity: string;
  category: string;
  theme: AppTheme;
  tabs: AppTabDefinition[];
  defaultTab: string;
}

export function detectAppArchetype(packageName = '', appName = '', fileName = ''): AppArchetype {
  const p = (packageName || '').toLowerCase();
  const a = (appName || '').toLowerCase();
  const f = (fileName || '').toLowerCase();
  const combined = `${p} ${a} ${f}`.toLowerCase();
  
  if (
    p.includes('wdio') ||
    p.includes('webdriver') ||
    p.includes('native.app') ||
    p.includes('native-app') ||
    a.includes('wdio') ||
    a.includes('webdriver') ||
    f.includes('wdio') ||
    f.includes('webdriver') ||
    combined.includes('wdio') || 
    combined.includes('webdriver') || 
    combined.includes('webdriverio') || 
    combined.includes('wdiodemoapp') ||
    combined.includes('native.app') ||
    combined.includes('native-app') ||
    combined.includes('android.wdio')
  ) {
    return 'wdio';
  }
  if (
    p.includes('soundrecorder') ||
    p.includes('sound.recorder') ||
    p.includes('danielkim') ||
    p.includes('audiorecorder') ||
    p.includes('audio.recorder') ||
    p.includes('voicerecorder') ||
    p.includes('voice.recorder') ||
    p.includes('recorder') ||
    p.includes('dictaphone') ||
    a.includes('sound recorder') ||
    a.includes('audio recorder') ||
    a.includes('voice recorder') ||
    a.includes('soundrecorder') ||
    f.includes('soundrecorder') ||
    f.includes('sound_recorder') ||
    f.includes('sound') ||
    combined.includes('soundrecorder') ||
    combined.includes('sound recorder') ||
    combined.includes('danielkim') ||
    combined.includes('voice recorder') ||
    combined.includes('audio recorder') ||
    combined.includes('audiorecorder') ||
    combined.includes('voicerecorder') ||
    (combined.includes('record') && (combined.includes('sound') || combined.includes('audio') || combined.includes('voice') || combined.includes('mic')))
  ) {
    return 'sound_recorder';
  }
  if (
    p.includes('fdroid') ||
    p.includes('f-droid') ||
    p.includes('f_droid') ||
    p.includes('org.fdroid') ||
    a.includes('fdroid') ||
    a.includes('f-droid') ||
    f.includes('fdroid') ||
    f.includes('f-droid') ||
    f.includes('f_droid') ||
    combined.includes('fdroid') ||
    combined.includes('f-droid') ||
    combined.includes('f_droid') ||
    combined.includes('org.fdroid')
  ) {
    return 'fdroid';
  }
  if (
    p.includes('malarm') ||
    p.includes('alarm') ||
    p.includes('clock') ||
    p.includes('timer') ||
    p.includes('schabi') ||
    a.includes('malarm') ||
    a.includes('alarm') ||
    a.includes('clock') ||
    f.includes('malarm') ||
    f.includes('alarm') ||
    f.includes('clock') ||
    combined.includes('malarm') ||
    combined.includes('alarm') ||
    combined.includes('clock') ||
    combined.includes('schabi')
  ) {
    return 'malarm';
  }
  if (
    p.includes('apidemos') ||
    p.includes('api.demos') ||
    p.includes('api_demos') ||
    p.includes('io.appium.android.apis') ||
    a.includes('api demos') ||
    a.includes('apidemos') ||
    f.includes('apidemos') ||
    f.includes('api_demos') ||
    combined.includes('apidemos') ||
    combined.includes('api demos') ||
    combined.includes('api-demos') ||
    combined.includes('io.appium.android.apis')
  ) {
    return 'apidemos';
  }
  if (
    p === 'com.qalculate.android' ||
    p.includes('qalculate') ||
    p.includes('calc') ||
    a.includes('qalculate') ||
    a.includes('calculator') ||
    f.includes('qalculate') ||
    f.includes('calc') ||
    combined.includes('qalculate') || 
    combined.includes('calculator') || 
    combined.includes('calc') || 
    combined.includes('math') ||
    combined.includes('qalc')
  ) {
    return 'qalculate';
  }
  if (
    p.includes('sauce') ||
    p.includes('mydemo') ||
    combined.includes('sauce') || 
    combined.includes('swag') || 
    combined.includes('mydemo') || 
    combined.includes('sample') ||
    combined.includes('saucelabs')
  ) {
    return 'saucelabs';
  }
  if (combined.includes('whatsapp') || combined.includes('chat') || combined.includes('telegram') || combined.includes('message')) {
    return 'whatsapp';
  }
  if (combined.includes('chrome') || combined.includes('browser') || combined.includes('web') || combined.includes('safari')) {
    return 'chrome';
  }
  if (combined.includes('settings') || combined.includes('system') || combined.includes('config') || combined.includes('preference')) {
    return 'settings';
  }
  if (combined.includes('machaxi') || combined.includes('badminton') || combined.includes('sport') || combined.includes('arena') || combined.includes('court')) {
    return 'machaxi';
  }
  if (
    combined.includes('niva') || 
    combined.includes('bupa') || 
    combined.includes('health') || 
    combined.includes('insurance') || 
    combined.includes('medic') || 
    combined.includes('hospital') || 
    combined.includes('doctor') || 
    combined.includes('clinic') || 
    combined.includes('claim') || 
    combined.includes('care') || 
    combined.includes('wellness')
  ) {
    return 'health_insurance';
  }
  if (
    combined.includes('miles') ||
    combined.includes('education') ||
    combined.includes('learning') ||
    combined.includes('course') ||
    combined.includes('edtech') ||
    combined.includes('academy') ||
    combined.includes('cpa') ||
    combined.includes('cma') ||
    combined.includes('acca') ||
    combined.includes('exam') ||
    combined.includes('student') ||
    combined.includes('study') ||
    combined.includes('classroom') ||
    combined.includes('university') ||
    combined.includes('college') ||
    combined.includes('training') ||
    combined.includes('lecture') ||
    combined.includes('byju') ||
    combined.includes('unacademy') ||
    combined.includes('coursera') ||
    combined.includes('udemy') ||
    combined.includes('skill')
  ) {
    return 'education';
  }
  if (combined.includes('swiggy') || combined.includes('zomato') || combined.includes('ubereats') || combined.includes('doordash') || combined.includes('food') || combined.includes('eats') || combined.includes('restaurant') || combined.includes('delivery')) {
    return 'food_delivery';
  }
  if (combined.includes('amazon') || combined.includes('flipkart') || combined.includes('shopify') || combined.includes('myntra') || combined.includes('shop') || combined.includes('ecommerce') || combined.includes('store') || combined.includes('cart') || combined.includes('retail')) {
    return 'ecommerce';
  }
  if (combined.includes('bank') || combined.includes('paytm') || combined.includes('gpay') || combined.includes('finance') || combined.includes('wallet') || combined.includes('loan') || combined.includes('crypto') || combined.includes('money') || combined.includes('payment')) {
    return 'finance';
  }
  if (combined.includes('instagram') || combined.includes('tiktok') || combined.includes('twitter') || combined.includes('social') || combined.includes('feed') || combined.includes('media') || combined.includes('post')) {
    return 'social';
  }
  return 'generic';
}

export function getCleanAppName(packageName = '', appName = '', fileName = ''): string {
  const combined = `${packageName} ${appName} ${fileName}`.toLowerCase();
  if (combined.includes('fdroid') || combined.includes('f-droid') || combined.includes('f_droid') || combined.includes('org.fdroid')) {
    return 'F-Droid';
  }
  if (
    combined.includes('malarm') ||
    combined.includes('alarm') ||
    combined.includes('clock') ||
    combined.includes('schabi')
  ) {
    return 'Malarm';
  }
  if (combined.includes('apidemos') || combined.includes('api demos') || combined.includes('apis')) {
    return 'API Demos';
  }
  if (
    combined.includes('soundrecorder') || 
    combined.includes('sound recorder') || 
    combined.includes('danielkim') ||
    combined.includes('audio recorder') ||
    combined.includes('audiorecorder') ||
    combined.includes('voice recorder') ||
    combined.includes('voicerecorder')
  ) {
    return 'Sound Recorder';
  }
  if (
    combined.includes('wdio') || 
    combined.includes('webdriver') || 
    combined.includes('native.app') || 
    combined.includes('native-app') || 
    combined.includes('wdiodemoapp') ||
    combined.includes('android.wdio')
  ) {
    return 'WebdriverIO Native Demo App';
  }
  if (combined.includes('qalculate') || combined.includes('qalc')) {
    return 'QALculate Mobile App';
  }
  if (combined.includes('calc') || combined.includes('calculator') || combined.includes('math')) {
    return 'QALculate Scientific Calculator';
  }
  if (combined.includes('sauce') || combined.includes('swag') || combined.includes('mydemo')) {
    return 'Sauce Labs My Demo App';
  }
  if (combined.includes('miles') || combined.includes('mileseducation') || combined.includes('milesone') || combined.includes('caira')) {
    return 'Miles One';
  }
  if (appName && appName !== 'Uploaded APK' && appName !== 'app.apk') {
    return appName;
  }
  if (fileName) {
    const clean = fileName.replace(/\.(apk|ipa)$/i, '').replace(/[-_]/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  if (packageName === 'com.whatsapp') return 'WhatsApp Business';
  if (packageName === 'com.android.chrome') return 'Google Chrome';
  if (packageName === 'com.android.settings') return 'Android Settings';
  if (packageName === 'com.machaxi.app') return 'Machaxi Sports';

  const parts = packageName.split('.');
  const lastPart = parts[parts.length - 1] || 'App';
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

export function getAppMetadata(packageName = 'com.saucelabs.mydemoapp.android', appName = '', fileName = '', customActivity = ''): AppMetadata {
  const archetype = detectAppArchetype(packageName, appName, fileName);
  const displayName = getCleanAppName(packageName, appName, fileName);
  const pkg = packageName || (archetype === 'saucelabs' ? 'com.saucelabs.mydemoapp.android' : archetype === 'qalculate' ? 'com.qalculate.android' : 'com.automatiqa.app');
  const launchActivity = customActivity || `${pkg}.MainActivity`;

  switch (archetype) {
    case 'wdio':
      return {
        archetype: 'wdio',
        displayName: displayName || 'WebdriverIO Native Demo App',
        packageName: pkg || 'com.wdiodemoapp',
        launchActivity: customActivity || 'com.wdiodemoapp.MainActivity',
        category: 'Mobile Automation & Native UI',
        theme: {
          primary: '#EA5906',
          primaryHover: '#C2410C',
          accent: '#3B82F6',
          headerBg: '#111827',
          headerText: '#FFFFFF',
          badgeBg: '#EA5906',
          badgeText: '#FFFFFF',
          buttonBg: '#EA5906'
        },
        tabs: [
          { id: 'home', label: 'Home' },
          { id: 'webview', label: 'Webview' },
          { id: 'login', label: 'Login' },
          { id: 'forms', label: 'Forms' },
          { id: 'swipe', label: 'Swipe' },
          { id: 'drag', label: 'Drag' }
        ],
        defaultTab: 'home'
      };

    case 'sound_recorder':
      return {
        archetype: 'sound_recorder',
        displayName: displayName || 'Sound Recorder',
        packageName: pkg || 'com.danielkim.soundrecorder',
        launchActivity: customActivity || 'com.danielkim.soundrecorder.activities.MainActivity',
        category: 'Audio & Voice Recording',
        theme: {
          primary: '#F44336',
          primaryHover: '#D32F2F',
          accent: '#FF5252',
          headerBg: '#E53935',
          headerText: '#FFFFFF',
          badgeBg: '#F44336',
          badgeText: '#FFFFFF',
          buttonBg: '#F44336'
        },
        tabs: [
          { id: 'record', label: 'RECORD' },
          { id: 'saved', label: 'SAVED RECORDINGS' }
        ],
        defaultTab: 'record'
      };

    case 'malarm':
      return {
        archetype: 'malarm',
        displayName: displayName || 'Malarm Minimalist Alarm',
        packageName: pkg || 'org.schabi.malarm',
        launchActivity: customActivity || 'org.schabi.malarm.MainActivity',
        category: 'Alarm Clock & Timer',
        theme: {
          primary: '#7C3AED',
          primaryHover: '#6D28D9',
          accent: '#A78BFA',
          headerBg: '#FAF5FF',
          headerText: '#1F2937',
          badgeBg: '#7C3AED',
          badgeText: '#FFFFFF',
          buttonBg: '#7C3AED'
        },
        tabs: [
          { id: 'alarms', label: 'Alarms' },
          { id: 'settings', label: 'Settings' }
        ],
        defaultTab: 'alarms'
      };

    case 'fdroid':
      return {
        archetype: 'fdroid',
        displayName: displayName || 'F-Droid',
        packageName: pkg || 'org.fdroid.fdroid',
        launchActivity: customActivity || 'org.fdroid.fdroid.views.main.MainActivity',
        category: 'FOSS Android App Repository',
        theme: {
          primary: '#1976D2',
          primaryHover: '#1565C0',
          accent: '#00BCD4',
          headerBg: '#0D47A1',
          headerText: '#FFFFFF',
          badgeBg: '#1976D2',
          badgeText: '#FFFFFF',
          buttonBg: '#1976D2'
        },
        tabs: [
          { id: 'latest', label: 'Latest' },
          { id: 'categories', label: 'Categories' },
          { id: 'nearby', label: 'Nearby' },
          { id: 'updates', label: 'Updates', badge: 3 },
          { id: 'settings', label: 'Settings' }
        ],
        defaultTab: 'latest'
      };

    case 'apidemos':
      return {
        archetype: 'apidemos',
        displayName: displayName || 'API Demos',
        packageName: pkg || 'io.appium.android.apis',
        launchActivity: customActivity || 'io.appium.android.apis.ApiDemos',
        category: 'Android Samples & API Demos',
        theme: {
          primary: '#2563EB',
          primaryHover: '#1D4ED8',
          accent: '#60A5FA',
          headerBg: '#1E3A8A',
          headerText: '#FFFFFF',
          badgeBg: '#2563EB',
          badgeText: '#FFFFFF',
          buttonBg: '#2563EB'
        },
        tabs: [
          { id: 'views', label: 'Views' },
          { id: 'controls', label: 'Controls' },
          { id: 'app', label: 'App' },
          { id: 'text', label: 'Text' }
        ],
        defaultTab: 'views'
      };

    case 'qalculate':
      return {
        archetype: 'qalculate',
        displayName: displayName || 'QALculate Mobile App',
        packageName: pkg || 'com.qalculate.android',
        launchActivity: customActivity || 'com.qalculate.android.MainActivity',
        category: 'Productivity & Scientific Calculator',
        theme: {
          primary: '#2563EB',
          primaryHover: '#1D4ED8',
          accent: '#10B981',
          headerBg: '#0F172A',
          headerText: '#F8FAFC',
          badgeBg: '#3B82F6',
          badgeText: '#FFFFFF',
          buttonBg: '#2563EB'
        },
        tabs: [
          { id: 'standard', label: 'Standard Calc' },
          { id: 'scientific', label: 'Scientific' },
          { id: 'converter', label: 'Unit Converter' },
          { id: 'history', label: 'History Log' }
        ],
        defaultTab: 'standard'
      };

    case 'saucelabs':
      return {
        archetype: 'saucelabs',
        displayName: displayName || 'Sauce Labs My Demo App',
        packageName: pkg,
        launchActivity: customActivity || 'com.saucelabs.mydemoapp.android.view.activities.MainActivity',
        category: 'Sauce Labs Sample App',
        theme: {
          primary: '#E2231A',
          primaryHover: '#C01E16',
          accent: '#00B4D8',
          headerBg: '#13111C',
          headerText: '#FFFFFF',
          badgeBg: '#E2231A',
          badgeText: '#FFFFFF',
          buttonBg: '#E2231A'
        },
        tabs: [
          { id: 'catalog', label: 'Products' },
          { id: 'details', label: 'Item View' },
          { id: 'cart', label: 'Cart' },
          { id: 'checkout', label: 'Checkout' },
          { id: 'login', label: 'Sign In' }
        ],
        defaultTab: 'catalog'
      };

    case 'health_insurance':
      return {
        archetype: 'health_insurance',
        displayName: displayName.includes('Niva') || displayName.includes('Health') ? displayName : (displayName || 'Niva Bupa Health Insurance'),
        packageName: pkg || 'com.nivabupa.health',
        launchActivity: customActivity || 'com.nivabupa.health.MainActivity',
        category: 'Health Insurance & Wellness',
        theme: {
          primary: '#0D9488',
          primaryHover: '#0F766E',
          accent: '#14B8A6',
          headerBg: '#134E4A',
          headerText: '#F0FDFA',
          badgeBg: '#0D9488',
          badgeText: '#FFFFFF',
          buttonBg: '#0D9488'
        },
        tabs: [
          { id: 'dashboard', label: 'Policy Hub' },
          { id: 'claims', label: 'Cashless Claims' },
          { id: 'hospitals', label: 'Network Hospitals' },
          { id: 'vitals', label: 'Health Score' },
          { id: 'card', label: 'Health Card' }
        ],
        defaultTab: 'dashboard'
      };

    case 'education':
      return {
        archetype: 'education',
        displayName: displayName || 'Miles One',
        packageName: pkg || 'com.mileseducation.app',
        launchActivity: customActivity || 'com.mileseducation.app.MainActivity',
        category: "India's #1 CPA & CMA Preparation App",
        theme: {
          primary: '#007AFF',
          primaryHover: '#0056B3',
          accent: '#F59E0B',
          headerBg: '#081426',
          headerText: '#FFFFFF',
          badgeBg: '#007AFF',
          badgeText: '#FFFFFF',
          buttonBg: '#007AFF'
        },
        tabs: [
          { id: 'home', label: 'Home' },
          { id: 'caira', label: 'CAIRA (AI)' },
          { id: 'programs', label: 'Programs' },
          { id: 'webinars', label: 'Webinars' },
          { id: 'refer', label: 'Refer & Earn' }
        ],
        defaultTab: 'home'
      };

    case 'whatsapp':
      return {
        archetype,
        displayName: displayName || 'WhatsApp Business',
        packageName: pkg,
        launchActivity: customActivity || 'com.whatsapp.HomeActivity',
        category: 'Communication',
        theme: {
          primary: '#075E54',
          primaryHover: '#128C7E',
          accent: '#25D366',
          headerBg: '#075E54',
          headerText: '#FFFFFF',
          badgeBg: '#25D366',
          badgeText: '#FFFFFF',
          buttonBg: '#25D366'
        },
        tabs: [
          { id: 'chats', label: 'Chats', badge: 3 },
          { id: 'status', label: 'Status' },
          { id: 'calls', label: 'Calls', badge: 1 }
        ],
        defaultTab: 'chats'
      };

    case 'chrome':
      return {
        archetype,
        displayName: 'Google Chrome',
        packageName: pkg,
        launchActivity: customActivity || 'com.google.android.apps.chrome.Main',
        category: 'Web Browser',
        theme: {
          primary: '#1E293B',
          primaryHover: '#334155',
          accent: '#3B82F6',
          headerBg: '#0F172A',
          headerText: '#F8FAFC',
          badgeBg: '#3B82F6',
          badgeText: '#FFFFFF',
          buttonBg: '#2563EB'
        },
        tabs: [
          { id: 'webpage', label: 'Active Web' },
          { id: 'search', label: 'Google Search' },
          { id: 'tabs', label: 'Open Tabs (4)' }
        ],
        defaultTab: 'webpage'
      };

    case 'settings':
      return {
        archetype,
        displayName: 'Android Settings',
        packageName: pkg,
        launchActivity: customActivity || 'com.android.settings.Settings',
        category: 'System Configuration',
        theme: {
          primary: '#1E293B',
          primaryHover: '#334155',
          accent: '#10B981',
          headerBg: '#090D16',
          headerText: '#F8FAFC',
          badgeBg: '#10B981',
          badgeText: '#FFFFFF',
          buttonBg: '#059669'
        },
        tabs: [
          { id: 'main', label: 'Settings' },
          { id: 'network', label: 'Wi-Fi & Network' },
          { id: 'display', label: 'Display & Theme' },
          { id: 'about', label: 'About Phone' }
        ],
        defaultTab: 'main'
      };

    case 'food_delivery':
      return {
        archetype,
        displayName: displayName || 'Food Delivery Pro',
        packageName: pkg,
        launchActivity,
        category: 'Food & Dining',
        theme: {
          primary: '#EA580C',
          primaryHover: '#C2410C',
          accent: '#F97316',
          headerBg: '#7C2D12',
          headerText: '#FFF7ED',
          badgeBg: '#EA580C',
          badgeText: '#FFFFFF',
          buttonBg: '#EA580C'
        },
        tabs: [
          { id: 'restaurants', label: 'Restaurants' },
          { id: 'dishes', label: 'Menu & Dishes' },
          { id: 'cart', label: 'Cart (2)', badge: 2 },
          { id: 'orders', label: 'Live Tracking' }
        ],
        defaultTab: 'restaurants'
      };

    case 'ecommerce':
      return {
        archetype,
        displayName: displayName || 'E-Commerce Store',
        packageName: pkg,
        launchActivity,
        category: 'Shopping & Retail',
        theme: {
          primary: '#D97706',
          primaryHover: '#B45309',
          accent: '#F59E0B',
          headerBg: '#78350F',
          headerText: '#FFFBEB',
          badgeBg: '#F59E0B',
          badgeText: '#000000',
          buttonBg: '#D97706'
        },
        tabs: [
          { id: 'explore', label: 'Shop Home' },
          { id: 'products', label: 'Catalog' },
          { id: 'cart', label: 'Cart (3)', badge: 3 },
          { id: 'checkout', label: 'Checkout' }
        ],
        defaultTab: 'explore'
      };

    case 'finance':
      return {
        archetype,
        displayName: displayName || 'Fintech & Wallet',
        packageName: pkg,
        launchActivity,
        category: 'Finance & Banking',
        theme: {
          primary: '#4F46E5',
          primaryHover: '#4338CA',
          accent: '#818CF8',
          headerBg: '#312E81',
          headerText: '#EEF2FF',
          badgeBg: '#10B981',
          badgeText: '#FFFFFF',
          buttonBg: '#4F46E5'
        },
        tabs: [
          { id: 'dashboard', label: 'Accounts' },
          { id: 'transfer', label: 'Pay & Transfer' },
          { id: 'history', label: 'Passbook' },
          { id: 'cards', label: 'Cards' }
        ],
        defaultTab: 'dashboard'
      };

    case 'social':
      return {
        archetype,
        displayName: displayName || 'Social Network',
        packageName: pkg,
        launchActivity,
        category: 'Social & Entertainment',
        theme: {
          primary: '#E11D48',
          primaryHover: '#BE123C',
          accent: '#FB7185',
          headerBg: '#881337',
          headerText: '#FFF1F2',
          badgeBg: '#E11D48',
          badgeText: '#FFFFFF',
          buttonBg: '#E11D48'
        },
        tabs: [
          { id: 'feed', label: 'Feed' },
          { id: 'explore', label: 'Trending' },
          { id: 'messages', label: 'Direct (5)', badge: 5 },
          { id: 'profile', label: 'My Profile' }
        ],
        defaultTab: 'feed'
      };

    case 'machaxi':
      return {
        archetype,
        displayName: 'Machaxi Sports Arena',
        packageName: pkg,
        launchActivity,
        category: 'Sports & Venues',
        theme: {
          primary: '#4F46E5',
          primaryHover: '#4338CA',
          accent: '#10B981',
          headerBg: '#1E1B4B',
          headerText: '#EEF2FF',
          badgeBg: '#10B981',
          badgeText: '#FFFFFF',
          buttonBg: '#4F46E5'
        },
        tabs: [
          { id: 'home', label: 'Arenas' },
          { id: 'booking', label: 'Booking' },
          { id: 'login', label: 'Member Sign-in' },
          { id: 'settings', label: 'Settings' }
        ],
        defaultTab: 'home'
      };

    case 'generic':
    default: {
      // Create distinctive visual palette from package hash
      const hash = pkg.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const palettes = [
        { primary: '#4F46E5', hover: '#4338CA', accent: '#6366F1', header: '#1E1B4B', btn: '#4F46E5' },
        { primary: '#0D9488', hover: '#0F766E', accent: '#14B8A6', header: '#134E4A', btn: '#0D9488' },
        { primary: '#7C3AED', hover: '#6D28D9', accent: '#8B5CF6', header: '#3B0764', btn: '#7C3AED' },
        { primary: '#2563EB', hover: '#1D4ED8', accent: '#3B82F6', header: '#172554', btn: '#2563EB' },
        { primary: '#059669', hover: '#047857', accent: '#10B981', header: '#064E3B', btn: '#059669' }
      ];
      const selectedPal = palettes[hash % palettes.length];

      return {
        archetype: 'generic',
        displayName: displayName || 'Mobile Application',
        packageName: pkg,
        launchActivity,
        category: 'Android Native Application',
        theme: {
          primary: selectedPal.primary,
          primaryHover: selectedPal.hover,
          accent: selectedPal.accent,
          headerBg: selectedPal.header,
          headerText: '#FFFFFF',
          badgeBg: selectedPal.accent,
          badgeText: '#FFFFFF',
          buttonBg: selectedPal.btn
        },
        tabs: [
          { id: 'dashboard', label: 'Overview' },
          { id: 'form', label: 'Form Entry' },
          { id: 'records', label: 'Data Items' },
          { id: 'settings', label: 'Account' }
        ],
        defaultTab: 'dashboard'
      };
    }
  }
}
