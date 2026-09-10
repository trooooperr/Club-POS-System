import React from 'react';
import {
  Menu, ArrowLeft,
  UtensilsCrossed, LayoutGrid, ClipboardList,
  BarChart2, Users, Package, Settings2, ChefHat
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const PAGE_ICONS = {
  billing: <UtensilsCrossed size={16} />,
  menu: <LayoutGrid size={16} />,
  orders: <ClipboardList size={16} />,
  sales: <BarChart2 size={16} />,
  workers: <Users size={16} />,
  inventory: <Package size={16} />,
  settings: <Settings2 size={16} />,
  kitchen: <ChefHat size={16} />,
};

export default function HumTumBar({
  onMenuClick,
  onBack,
  title = '',
  section = '',
  tableStats = {},
  hint = '',
}) {
  const { isDryDay, toggleDryDay, role, setActiveSection } = useApp();
  const isAdmin = role === 'admin' || role === 'manager';
  const icon = PAGE_ICONS[section] || PAGE_ICONS[title?.toLowerCase()] || null;
  const activeCount = tableStats.active ?? 0;
  const vacantCount = tableStats.complete ?? 0;
  const isInventoryPage = section === 'inventory' || title?.toLowerCase() === 'inventory';

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
    } else if (setActiveSection) {
      setActiveSection('billing');
    }
  };

  return (
    <header className="humtum-bar">
      {/* LEFT ─ menu toggle + back + title */}
      <div className="humtum-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          className="hnav-menu-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        {section !== 'billing' && title?.toLowerCase() !== 'billing' && (
          <button
            className="btn btn-ghost hnav-back-btn"
            onClick={handleBack}
            aria-label="Back"
            title="Go back to Billing"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--b2)',
              background: 'var(--s2)',
              color: 'var(--t0)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={15} />
            <span className="hnav-back-text">Back</span>
          </button>
        )}

        <div className="hnav-title-group">
          {icon && <span className="hnav-page-icon">{icon}</span>}
          <span className="hnav-title">{title}</span>
        </div>
      </div>


      {/* RIGHT ─ live table stats */}
      <div className="hnav-stats">
        <div className="hnav-stat">
          <span className="hnav-stat-dot occ-dot" />
          <div>
            <div className="hnav-stat-num">{activeCount}</div>
            <div className="hnav-stat-label">Active</div>
          </div>
        </div>
        <div className="hnav-stat">
          <span className="hnav-stat-dot vac-dot" />
          <div>
            <div className="hnav-stat-num">{vacantCount}</div>
            <div className="hnav-stat-label">Vacant</div>
          </div>
        </div>
      </div>
    </header>
  );
}
