import React from 'react';
import { useApp, ROLE_HIERARCHY } from '../context/AppContext';
import { LayoutDashboard, UtensilsCrossed, ClipboardList, BarChart3, Users, Package, Settings, Sun, Moon, LogOut, X, Menu, Clock, Calendar, PartyPopper } from 'lucide-react';

const NAV = [
  { id:'billing',   label:'Billing',         icon:LayoutDashboard, perm:'billing'   },
  { id:'menu',      label:'Menu',            icon:UtensilsCrossed, perm:'menu'      },
  { id:'inventory', label:'Inventory',       icon:Package,         perm:'inventory' },
  { id:'orders',    label:'Orders',          icon:ClipboardList,   perm:'orders'    },
  { id:'sales',     label:'Analytics',       icon:BarChart3,       perm:'sales'     },
  { id:'events',    label:'Events',          icon:Calendar,        perm:'events'    },
  { id:'workers',   label:'Staff',           icon:Users,           perm:'workers'   },
  { id:'settings',  label:'Settings',        icon:Settings,        perm:'settings'  },
  { id:'kitchen',   label:'Kitchen Display', icon:UtensilsCrossed, perm:'kitchen'   },
  { id:'bar',       label:'Bar Display',     icon:UtensilsCrossed, perm:'kitchen'   },
];

const RC = { admin:'#0D9488', manager:'#B8860B', staff:'#10B981' };

export default function Sidebar() {
  const { activeSection, setActiveSection, can, role, currentUser, logout, settings, saveSettings, sidebarOpen, setSidebarOpen } = useApp();
  const rc = RC[role] || '#0D9488';
  const go = id => { setActiveSection(id); setSidebarOpen(false); };

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
        <div className="logo-wrap">
          <div className="logo-box" style={{ background: 'none', boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/favicon.ico" alt="Logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          </div>
          <div style={{ flex:1 }}>
            <div className="logo-name" style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, letterSpacing: '1px', color: 'var(--a)', fontSize: 22, textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
              HUMTUM
            </div>
            <div className="logo-sub" style={{ color: 'var(--t2)', fontSize: 11, letterSpacing: '0.02em', marginTop: '-2px' }}>
              The BAR & Restaurant
            </div>
          </div>
          <button className="iBtn sbar-close" style={{ padding:4 }} onClick={()=>setSidebarOpen(false)}><X size={12}/></button>
        </div>

        {/* User */}
        <div className="user-bar">
          <div className="avatar" style={{ background:`${rc}18`, color:rc, border:`1px solid ${rc}30` }}>
            {currentUser?.name?.[0]||'?'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{currentUser?.name}</div>
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
      </aside>
    </>
  );
}
