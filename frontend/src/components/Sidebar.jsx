import React from 'react';
import { useApp, ROLE_HIERARCHY } from '../context/AppContext';
import { LayoutDashboard, UtensilsCrossed, ClipboardList, BarChart3, Users, Package, Settings, Sun, Moon, LogOut, X, Menu, Clock, Calendar, CalendarCheck, PartyPopper, Tag, Wallet, DollarSign } from 'lucide-react';

const NAV = [
  { id:'billing',   label:'Billing',         icon:LayoutDashboard, perm:'billing'   },
  { id:'menu',      label:'Menu',            icon:UtensilsCrossed, perm:'menu'      },
  { id:'inventory', label:'Inventory',       icon:Package,         perm:'inventory' },
  { id:'orders',    label:'Orders',          icon:ClipboardList,   perm:'orders'    },
  { id:'sales',     label:'Analytics',       icon:BarChart3,       perm:'sales'     },
  { id:'discounts', label:'Discounts',       icon:Tag,             perm:'sales'     },
  { id:'due-payments', label:'Due Payments', icon:Wallet,          perm:'sales'     },
  { id:'expenses',  label:'Expenses',        icon:DollarSign,      perm:'sales'     },
  { id:'bookings',  label:'Bookings',        icon:CalendarCheck,   perm:'bookings'  },
  { id:'workers',   label:'Staff',           icon:Users,           perm:'workers'   },
  { id:'attendance', label:'Attendance',      icon:CalendarCheck,   perm:'attendance'},
  { id:'settings',  label:'Settings',        icon:Settings,        perm:'settings'  },
  { id:'kitchen',   label:'Kitchen Display', icon:UtensilsCrossed, perm:'kitchen'   },
  { id:'bar',       label:'Bar Display',     icon:UtensilsCrossed, perm:'kitchen'   },
];

const RC = { admin:'#0D9488', manager:'#B8860B', staff:'#10B981' };

export default function Sidebar() {
  const { activeSection, setActiveSection, can, role, currentUser, logout, settings, saveSettings, sidebarOpen, setSidebarOpen } = useApp();
  const rc = RC[role] || '#0D9488';
  const go = id => { setActiveSection(id); setSidebarOpen(false); };

  const rawName = (settings?.restaurantName || 'HUMTUM').trim();
  let mainTitle = rawName;
  let subtitle = (settings?.brandTagline || '').trim();

  // If no explicit brandTagline is set, intelligently split if the restaurantName has "The Bar & Restaurant" or "The Bar"
  if (!subtitle && /the\s+bar\s*(&|and)\s*restaurant/i.test(rawName)) {
    mainTitle = rawName.replace(/\s*the\s+bar\s*(&|and)\s*restaurant/i, '').trim();
    subtitle = 'The Bar & Restaurant';
  } else if (!subtitle && rawName.toUpperCase().startsWith('HUMTUM') && rawName.length > 6) {
    mainTitle = 'HUMTUM';
    subtitle = rawName.slice(6).trim();
  }

  const userDisplayName = currentUser?.name || 'Administrator';

  return (
    <>
      {/* Overlay Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside className={`sbar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="logo-wrap" style={{ alignItems: 'center', padding: '14px 16px' }}>
          <div className="logo-box" style={{ background: 'none', boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img
              src={settings?.logoUrl || '/logo.png'}
              alt={mainTitle || 'Logo'}
              style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px' }}
              onError={(e) => {
                if (e.target.src !== window.location.origin + '/favicon.ico') {
                  e.target.src = '/favicon.ico';
                }
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, marginLeft: '4px' }}>
            <div
              className="logo-name"
              style={{
                fontFamily: "'Cinzel', serif",
                fontWeight: 900,
                letterSpacing: '1px',
                color: 'var(--a, #F59E0B)',
                fontSize: 21,
                textTransform: 'uppercase',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                lineHeight: 1.15
              }}
              title={mainTitle}
            >
              {mainTitle}
            </div>
            {subtitle && (
              <div
                className="logo-sub"
                style={{
                  color: 'var(--t2)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  marginTop: '2px',
                  lineHeight: 1.2
                }}
                title={subtitle}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button className="iBtn sbar-close" style={{ padding:4 }} onClick={()=>setSidebarOpen(false)}><X size={12}/></button>
        </div>

        {/* User */}
        <div className="user-bar">
          <div className="avatar" style={{ background:`${rc}18`, color:rc, border:`1px solid ${rc}30` }}>
            {userDisplayName[0] || '?'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userDisplayName}</div>
            <span className="role-tag" style={{ background:`${rc}14`, color:rc, border:`1px solid ${rc}25`, marginTop:1 }}>
              {ROLE_HIERARCHY[role]?.label}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
          {NAV.filter(n=>can(n.perm)).map(({id,label,icon:Icon})=>(
            <button key={id} className={`nitem${activeSection===id?' on':''}`} onClick={()=>go(id)}>
              <Icon size={14}/>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Theme */}
        <div style={{ padding:'0 14px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'var(--t1)', display:'flex', alignItems:'center', gap:5 }}>
            {settings.darkMode ? <Moon size={12}/> : <Sun size={12}/>}
            {settings.darkMode ? 'Dark' : 'Light'} Mode
          </span>
          <label className="switch">
            <input type="checkbox" checked={!!settings.darkMode} onChange={e=>saveSettings({darkMode:e.target.checked})}/>
            <span className="slider"/>
          </label>
        </div>

        {/* Logout */}
        <div style={{ padding:'8px 10px 14px', borderTop:'1px solid var(--b0)' }}>
          <button className="btn btn-ghost" style={{ width:'100%', fontSize:12 }} onClick={logout}>
            <LogOut size={12}/> Sign Out
          </button>
        </div>

        <div style={{ padding: '0 10px 10px', textAlign: 'center', fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.04em' }}>
          Powered by <b style={{ color: 'var(--t2)' }}>{mainTitle || 'HUMTUM'} POS</b>
        </div>
      </aside>
    </>
  );
}
