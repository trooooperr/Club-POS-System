import React from 'react';
import {
  Menu,
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
  title = '',
  section = '',
  tableStats = {},
  hint = '',
}) {
  const { isDryDay, toggleDryDay, role } = useApp();
  const isAdmin = role === 'admin' || role === 'manager';
  const icon = PAGE_ICONS[section] || PAGE_ICONS[title?.toLowerCase()] || null;
  const activeCount = tableStats.active ?? 0;
  const vacantCount = tableStats.complete ?? 0;
  const isInventoryPage = section === 'inventory' || title?.toLowerCase() === 'inventory';

  return (
    <header className="humtum-bar">
      {/* LEFT ─ menu toggle + title */}
      <div className="humtum-left">
        <button
          className="hnav-menu-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div className="hnav-title-group">
          {icon && <span className="hnav-page-icon">{icon}</span>}
          <span className="hnav-title">{title}</span>
        </div>
      </div>

      {/* CENTER ─ Dry Day Button on Inventory Page & shortcut hint */}
      <div className="hnav-center" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isInventoryPage && (
          <button
            className={`dry-day-btn ${isDryDay ? 'active' : ''}`}
            onClick={() => {
              if (isAdmin) {
                toggleDryDay();
              } else {
                alert('Only Admin/Manager can toggle Dry Day mode.');
              }
            }}
            title={isDryDay ? 'Dry Day is ACTIVE (Alcohol items disabled)' : 'Click to activate Dry Day (Disable all alcohol items)'}
          >
            {isDryDay ? '🚫 DRY DAY: ON' : '🍺 Dry Day: OFF'}
          </button>
        )}
        {hint && <div className="hnav-hint-pill">{hint}</div>}
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
