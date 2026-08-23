import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import InvoiceModal from './components/InvoiceModal';
import HumTumBar from './components/HumTumBar';
import LoginPage from './pages/LoginPage';
import BillingPage from './pages/BillingPage';
import MenuPage from './pages/MenuPage';
import OrdersPage from './pages/OrdersPage';
import SalesPage from './pages/SalesPage';
import WorkersPage from './pages/WorkersPage';
import InventoryPage from './pages/InventoryPage';
import SettingsPage from './pages/SettingsPage';
import KitchenDisplay from './pages/KitchenDisplay';
import { Menu } from 'lucide-react';
import './index.css';
import Toast from './components/Toast';

function Shell() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 750 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { currentUser, activeSection, setActiveSection, selectTable, settings, loading, error, loadData, sidebarOpen, setSidebarOpen, invoiceOrder, activeTableId, showToast, tableBills, getTableStatus, NUM_TABLES } = useApp();

  const pageTitles = {
    billing: 'Billing',
    menu: 'Menu',
    inventory: 'Inventory',
    orders: 'Orders',
    sales: 'Sales',
    workers: 'Workers',
    settings: 'Settings',
    kitchen: 'Kitchen Display',
    bar: 'Bar Display',
  };
  const currentPageTitle = pageTitles[activeSection] || 'Dashboard';
  const activeTableCount = Object.keys(tableBills || {}).filter(tableId => getTableStatus(tableId) !== 'free').length;
  const completeTableCount = Math.max(0, NUM_TABLES - activeTableCount);
  const tableStats = { active: activeTableCount, complete: completeTableCount };

  useEffect(() => {
    document.body.className = settings.darkMode ? '' : 'lm';
  }, [settings.darkMode]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  // INACTIVITY TIMEOUT (30 mins)
  useEffect(() => {
    if (!currentUser) return;
    let timeout;
    const reset = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        showToast('Session expired due to inactivity', 'amber');
        setTimeout(() => window.location.reload(), 2000); // Give time for toast
      }, 30 * 60 * 1000);
    };
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    reset();
    return () => {
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      clearTimeout(timeout);
    };
  }, [currentUser, showToast]);

  // Global ESC → go to table picker
  useEffect(() => {
    if (!currentUser) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Don't intercept if a modal/overlay is open (has its own ESC handling)
        const hasModal = document.querySelector('.moverlay, [role="dialog"], .overlay');
        if (hasModal) return;
        setActiveSection('billing');
        selectTable(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentUser, setActiveSection, selectTable]);

  if (!currentUser) return <LoginPage />;

  const pages = { billing:<BillingPage/>, menu:<MenuPage/>, orders:<OrdersPage/>, sales:<SalesPage/>, workers:<WorkersPage/>, inventory:<InventoryPage/>, settings:<SettingsPage/>, kitchen:<KitchenDisplay department="kitchen" />, bar:<KitchenDisplay department="bar" /> };

  const showTopBar = activeSection !== 'billing'; // Hide HumTumBar entirely on billing page
  const navHint = activeSection === 'billing' ? 'BILL = Ctrl+B   ·   KOT = Ctrl+K' : '';

  return (
    <div className="shell">
      <Sidebar/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {showTopBar && (
          <HumTumBar
            onMenuClick={()=>setSidebarOpen(true)}
            title={currentPageTitle}
            tableStats={tableStats}
            hint={navHint}
          />
        )}
        
        {loading && (
          <div className="top-loader-line">
            <div className="top-loader-progress"></div>
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(239,68,68,0.07)', borderBottom:'1px solid rgba(239,68,68,0.18)', padding:'6px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:'var(--red)', flexShrink:0 }}>
            <span>⚠️ {error}</span>
            <button className="btn btn-danger btn-sm" onClick={loadData}>Retry</button>
          </div>
        )}

        <main className={`main${(activeSection === 'billing' || activeSection === 'kitchen') ? ' full-page-section' : ''}`}>
          <div className="page-inner">{pages[activeSection]||<BillingPage/>}</div>
        </main>
      </div>
      {invoiceOrder && <InvoiceModal/>}
      <Toast/>
    </div>
  );
}

export default function App() { return <AppProvider><Shell/></AppProvider>; }
