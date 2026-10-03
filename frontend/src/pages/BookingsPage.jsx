import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { BILL_LOGO_BASE64 } from '../lib/billLogoBase64';
import { 
  Calendar, CalendarCheck, Clock, Plus, Search, Printer, Edit3, Trash2, 
  Users, CheckCircle2, XCircle, Phone, MapPin, Wallet, 
  Sparkles, PartyPopper, X, Check, RefreshCw, ChevronRight, AlertCircle, ArrowUpRight
} from 'lucide-react';

export default function BookingsPage() {
  const { settings, showToast, currentUser } = useApp();

  const getBusinessTodayStr = () => {
    const d = new Date();
    const istTime = new Date(d.getTime() + 19800000); // IST offset
    let year = istTime.getUTCFullYear();
    let month = istTime.getUTCMonth();
    let dateVal = istTime.getUTCDate();
    let hour = istTime.getUTCHours();

    if (hour < 5) {
      const prevDay = new Date(Date.UTC(year, month, dateVal - 1));
      year = prevDay.getUTCFullYear();
      month = prevDay.getUTCMonth();
      dateVal = prevDay.getUTCDate();
    }

    const yyyy = year;
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(dateVal).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getBusinessTodayStr();

  // State
  const [bookings, setBookings] = useState([]);
  const [summary, setSummary] = useState({ totalBookings: 0, totalAdvance: 0, totalEstimatedAmount: 0, upcomingCount: 0 });
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('upcoming'); // 'upcoming' | 'today' | 'past' | 'all'
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [receiptBooking, setReceiptBooking] = useState(null);

  // Form State
  const initialForm = {
    customerName: '',
    customerPhone: '',
    bookingDate: todayStr,
    bookingTime: '07:30 PM',
    guestCount: 4,
    tableNo: '',
    occasion: 'Table Reservation',
    billingType: 'table_only',
    pricePerPlate: '',
    foodAmount: '',
    decorationAmount: '',
    totalAmount: '',
    advancePayment: '',
    advancePaymentMode: 'cash',
    advanceCashAmount: '',
    advanceUpiAmount: '',
    advancePaymentDate: todayStr,
    status: 'confirmed',
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch bookings
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let queryUrl = `/api/bookings?type=${filterType}`;
      if (statusFilter !== 'all') queryUrl += `&status=${statusFilter}`;
      if (searchQuery.trim()) queryUrl += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const res = await authFetch(apiUrl(queryUrl));
      if (!res.ok) throw new Error('Failed to load bookings');
      const data = await res.json();
      setBookings(data.bookings || []);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      console.error(err);
      showToast('Error loading bookings', 'amber');
    } finally {
      setLoading(false);
    }
  }, [filterType, statusFilter, searchQuery, showToast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingBooking(null);
    setFormData({
      ...initialForm,
      bookingDate: todayStr,
      advancePaymentDate: todayStr
    });
    setModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (b) => {
    setEditingBooking(b);
    setFormData({
      customerName: b.customerName || '',
      customerPhone: b.customerPhone || '',
      bookingDate: b.bookingDate || todayStr,
      bookingTime: b.bookingTime || '07:30 PM',
      guestCount: b.guestCount || 2,
      tableNo: b.tableNo || '',
      occasion: b.occasion || 'Table Reservation',
      billingType: b.billingType || 'custom',
      pricePerPlate: b.pricePerPlate ? String(b.pricePerPlate) : '',
      foodAmount: b.foodAmount ? String(b.foodAmount) : '',
      decorationAmount: b.decorationAmount ? String(b.decorationAmount) : '',
      totalAmount: b.totalAmount !== undefined && b.totalAmount !== null ? String(b.totalAmount) : '',
      advancePayment: b.advancePayment !== undefined && b.advancePayment !== null ? String(b.advancePayment) : '',
      advancePaymentMode: b.advancePaymentMode || 'cash',
      advanceCashAmount: b.advanceCashAmount !== undefined && b.advanceCashAmount !== null ? String(b.advanceCashAmount) : '',
      advanceUpiAmount: b.advanceUpiAmount !== undefined && b.advanceUpiAmount !== null ? String(b.advanceUpiAmount) : '',
      advancePaymentDate: b.advancePaymentDate || todayStr,
      status: b.status || 'confirmed',
      notes: b.notes || ''
    });
    setModalOpen(true);
  };

  // Auto calculate total for per plate or decoration
  const updateBillingAmounts = (updates) => {
    setFormData(prev => {
      const merged = { ...prev, ...updates };
      const guests = parseInt(merged.guestCount, 10) || 0;
      const pPerPlate = parseFloat(merged.pricePerPlate) || 0;
      const decor = parseFloat(merged.decorationAmount) || 0;

      let food = parseFloat(merged.foodAmount) || 0;
      if (merged.billingType === 'per_plate') {
        food = guests * pPerPlate;
        merged.foodAmount = food > 0 ? String(food) : '';
      }

      // For table_only, no fixed total
      if (merged.billingType === 'table_only') {
        merged.totalAmount = '';
        merged.foodAmount = '';
        merged.decorationAmount = '';
      } else {
        const calcTotal = food + decor;
        if (calcTotal > 0) {
          merged.totalAmount = String(calcTotal);
        }
      }
      return merged;
    });
  };

  // Submit booking form
  const handleSaveBooking = async (e, andPrint = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!formData.customerName.trim()) {
      showToast('Please enter customer name', 'amber');
      return;
    }
    if (!formData.customerPhone.trim()) {
      showToast('Please enter customer phone number', 'amber');
      return;
    }
    if (!formData.bookingDate) {
      showToast('Please select booking date', 'amber');
      return;
    }

    setFormSubmitting(true);
    try {
      const url = editingBooking ? `/api/bookings/${editingBooking._id}` : '/api/bookings';
      const method = editingBooking ? 'PUT' : 'POST';

      const res = await authFetch(apiUrl(url), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save booking');
      }

      const saved = await res.json();
      showToast(editingBooking ? 'Booking updated successfully' : 'Booking created successfully!', 'green');
      setModalOpen(false);
      await fetchBookings();

      if (andPrint && saved) {
        handlePrintReceipt(saved);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error saving booking', 'red');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle quick status
  const handleQuickStatus = async (id, newStatus) => {
    try {
      const res = await authFetch(apiUrl(`/api/bookings/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update status');
      showToast(`Status updated to ${newStatus}`, 'green');
      fetchBookings();
    } catch (err) {
      showToast(err.message, 'amber');
    }
  };

  // Delete booking
  const handleDeleteBooking = async (id, bNo) => {
    if (!window.confirm(`Are you sure you want to delete Booking ${bNo}?`)) return;
    try {
      const res = await authFetch(apiUrl(`/api/bookings/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete booking');
      showToast('Booking deleted', 'green');
      fetchBookings();
    } catch (err) {
      showToast(err.message, 'red');
    }
  };

  // Print Receipt
  const handlePrintReceipt = (booking) => {
    setReceiptBooking(booking);
    setTimeout(() => {
      triggerPrintReceipt(booking);
    }, 100);
  };

  const triggerPrintReceipt = (b) => {
    const restName = (settings.restaurantName || 'HUMTUM').trim();
    const restAddress = settings.address || 'Rajendra Nagar, Gorakhpur';
    const restPhone = settings.phone || settings.contact || '';
    const gstin = settings.gstin || '';

    const advanceAmt = b.advancePayment || 0;
    const estTotal = b.totalAmount || 0;
    const balanceDue = Math.max(0, estTotal - advanceAmt);

    let paymentModeText = (b.advancePaymentMode || 'CASH').toUpperCase();
    if (b.advancePaymentMode === 'split') {
      paymentModeText = `SPLIT (Cash: ₹${b.advanceCashAmount || 0}, UPI: ₹${b.advanceUpiAmount || 0})`;
    }

    const printHtml = `
      <html>
        <head>
          <title>RECEIPT - ${b.bookingNo}</title>
          <style>
            @page { size: 80mm auto; margin: 3mm; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 74mm; 
              margin: 0 auto; 
              padding: 4px; 
              font-size: 13px; 
              color: #000; 
              line-height: 1.25; 
              font-weight: bold; 
            }
            .center { text-align: center; }
            .brand { font-size: 19px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 1px; }
            .sub-info { font-size: 11px; margin-bottom: 3px; font-weight: normal; }
            .dash-line { border-top: 1px dashed #000; margin: 6px 0; }
            .thick-line { border-top: 2px solid #000; margin: 6px 0; }
            .receipt-title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 12px; }
            .label { color: #222; }
            .val { font-weight: 900; text-align: right; }
            .highlight-box { border: 1.5px solid #000; padding: 6px; margin: 8px 0; text-align: center; }
            .advance-title { font-size: 13px; font-weight: 900; text-transform: uppercase; }
            .advance-amount { font-size: 20px; font-weight: 900; margin: 2px 0; }
            .sign-area { margin-top: 25px; padding-top: 20px; border-top: 1px dashed #000; display: flex; justify-content: flex-end; align-items: flex-end; }
            .sign-box { text-align: center; width: 45%; }
            .sign-line { border-top: 1px solid #000; margin-top: 25px; padding-top: 2px; font-size: 11px; }
            .footer-msg { font-size: 11px; margin-top: 12px; font-style: italic; text-align: center; }
          </style>
        </head>
        <body>
          <div class="center">
            <img src="${BILL_LOGO_BASE64}" alt="HUMTUM" style="max-height: 55px; max-width: 120px; width: auto; height: auto; object-fit: contain; margin: 0 auto 4px; display: block;" />
            <div class="brand">${restName}</div>
            <div class="sub-info">${restAddress}</div>
            ${restPhone ? `<div class="sub-info">Contact: ${restPhone}</div>` : ''}
            <div class="sub-info">Email: contact@humtumbar.in</div>
            ${gstin ? `<div class="sub-info">GSTIN: ${gstin}</div>` : ''}
          </div>

          <div class="thick-line"></div>
          <div class="center receipt-title">BOOKING CONFIRMATION</div>
          <div class="dash-line"></div>

          <div class="row"><span class="label">BOOKING NO:</span><span class="val">${b.bookingNo}</span></div>
          <div class="row"><span class="label">DATE OF EVENT:</span><span class="val">${b.bookingDate}</span></div>
          <div class="row"><span class="label">TIME:</span><span class="val">${b.bookingTime || '07:00 PM'}</span></div>
          <div class="row"><span class="label">OCCASION:</span><span class="val">${b.occasion || 'Reservation'}</span></div>
          <div class="row"><span class="label">GUESTS:</span><span class="val">${b.guestCount || 1} Persons</span></div>
          ${b.tableNo ? `<div class="row"><span class="label">AREA / TABLE:</span><span class="val">${b.tableNo}</span></div>` : ''}
          
          <div class="dash-line"></div>
          <div class="row"><span class="label">CUSTOMER:</span><span class="val">${b.customerName}</span></div>
          <div class="row"><span class="label">PHONE:</span><span class="val">${b.customerPhone}</span></div>
          <div class="row"><span class="label">BOOKED ON:</span><span class="val">${b.createdAtDate || b.bookingDate}</span></div>

          <div class="dash-line"></div>

          <div class="row"><span class="label">BILLING PLAN:</span><span class="val">${b.billingType === 'per_plate' ? `₹${b.pricePerPlate}/Plate (${b.guestCount || 1} Guests)` : 'Custom Bill'}</span></div>
          ${b.foodAmount ? `<div class="row"><span class="label">FOOD & CATERING:</span><span class="val">₹${Number(b.foodAmount).toLocaleString('en-IN')}</span></div>` : ''}
          ${b.decorationAmount ? `<div class="row"><span class="label">DECORATION & SETUP:</span><span class="val">₹${Number(b.decorationAmount).toLocaleString('en-IN')}</span></div>` : ''}


          <div class="highlight-box">
            <div class="advance-title">ADVANCE RECEIVED</div>
            <div class="advance-amount">₹${advanceAmt.toLocaleString('en-IN')}</div>
            <div style="font-size: 11px;">Mode: ${paymentModeText}</div>
            <div style="font-size: 10px; color: #444; margin-top: 2px;">Paid On: ${b.advancePaymentDate || b.bookingDate}</div>
          </div>

          <div class="row" style="font-size: 13px; margin-top: 6px;">
            <span class="label">BALANCE DUE AT EVENT:</span>
            <span class="val">₹${balanceDue.toLocaleString('en-IN')}</span>
          </div>

          ${b.notes ? `
            <div class="dash-line"></div>
            <div style="font-size: 11px; margin: 4px 0;">
              <strong>SPECIAL INSTRUCTIONS / NOTES:</strong><br/>
              ${b.notes}
            </div>
          ` : ''}

          <div class="sign-area">
            <div class="sign-box">
              <div class="sign-line">Manager Signature</div>
            </div>
          </div>

          <div class="dash-line"></div>
          <div class="footer-msg">
            Thank you for choosing ${restName}!<br/>
            Please present this receipt during arrival.
          </div>
        </body>
      </html>
    `;

    // Print via hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Print iframe error:', err);
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 3000);
      }
    }, 400);
  };

  // Helper date display
  const formatFriendlyDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr === todayStr) return 'Today';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts.map(Number);
    const dateObj = new Date(y, m - 1, d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m - 1]} ${y}`;
  };

  const getDaysCountdownBadge = (dateStr, status) => {
    if (status === 'cancelled') {
      return <span className="booking-badge badge-cancelled">Cancelled</span>;
    }
    if (status === 'completed') {
      return <span className="booking-badge badge-completed">Completed</span>;
    }

    if (dateStr === todayStr) {
      return <span className="booking-badge badge-today">Today</span>;
    }

    const [y, m, d] = dateStr.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1, d));
    const [cy, cm, cd] = todayStr.split('-').map(Number);
    const current = new Date(Date.UTC(cy, cm - 1, cd));

    const diffDays = Math.round((target - current) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return <span className="booking-badge badge-upcoming">Tomorrow</span>;
    if (diffDays > 1) return <span className="booking-badge badge-upcoming">In {diffDays} Days</span>;
    return <span className="booking-badge badge-past">{Math.abs(diffDays)} Days Ago</span>;
  };

  return (
    <div className="fi bookings-page">
      {/* Top Header */}
      <div className="bookings-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarCheck size={18} style={{ color: 'var(--a)' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={fetchBookings} 
            title="Refresh bookings"
            style={{ padding: '8px 12px', border: '1px solid var(--b2)', borderRadius: 8 }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>

          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ 
              background: 'linear-gradient(135deg, var(--a), #d97706)',
              color: '#000',
              fontWeight: 700,
              padding: '9px 18px',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Plus size={18} />
            New Booking
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="bookings-kpi-grid">
        <div className="booking-kpi-card">
          <div className="booking-kpi-header">
            <span className="booking-kpi-label">Upcoming Bookings</span>
            <div className="booking-kpi-icon-pill" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--a)' }}>
              <Calendar size={16} />
            </div>
          </div>
          <div className="booking-kpi-value mono" style={{ color: 'var(--a)' }}>
            {summary.upcomingCount || 0}
          </div>
          <div className="booking-kpi-sub">
            <span className="kpi-indicator" style={{ background: 'var(--a)' }}></span>
            Scheduled future reservations
          </div>
        </div>

        <div className="booking-kpi-card">
          <div className="booking-kpi-header">
            <span className="booking-kpi-label">Advance Collected</span>
            <div className="booking-kpi-icon-pill" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
              <Wallet size={16} />
            </div>
          </div>
          <div className="booking-kpi-value mono" style={{ color: '#10B981' }}>
            ₹{(summary.totalAdvance || 0).toLocaleString('en-IN')}
          </div>
          <div className="booking-kpi-sub">
            <span className="kpi-indicator" style={{ background: '#10B981' }}></span>
            Counted in daily sales analytics
          </div>
        </div>

        <div className="booking-kpi-card">
          <div className="booking-kpi-header">
            <span className="booking-kpi-label">Estimated Revenue</span>
            <div className="booking-kpi-icon-pill" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6' }}>
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="booking-kpi-value mono" style={{ color: '#3B82F6' }}>
            ₹{(summary.totalEstimatedAmount || 0).toLocaleString('en-IN')}
          </div>
          <div className="booking-kpi-sub">
            <span className="kpi-indicator" style={{ background: '#3B82F6' }}></span>
            Total agreed billing volume
          </div>
        </div>

        <div className="booking-kpi-card">
          <div className="booking-kpi-header">
            <span className="booking-kpi-label">Total Bookings</span>
            <div className="booking-kpi-icon-pill" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#A855F7' }}>
              <Users size={16} />
            </div>
          </div>
          <div className="booking-kpi-value mono" style={{ color: 'var(--t0)' }}>
            {summary.totalBookings || 0}
          </div>
          <div className="booking-kpi-sub">
            <span className="kpi-indicator" style={{ background: '#A855F7' }}></span>
            Matching current filters
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sales-header-res" style={{ marginTop: 20, marginBottom: 16 }}>
        <div className="unified-pill-box filter-pills">
          {[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'today', label: "Today's" },
            { id: 'past', label: 'Past' },
            { id: 'all', label: 'All Dates' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`f-pill ${filterType === tab.id ? 'active' : ''}`}
              onClick={() => setFilterType(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          {/* Status selector */}
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="d-input"
            style={{ 
              borderRadius: 20, 
              padding: '6px 14px', 
              fontSize: 12, 
              background: 'var(--s1)', 
              color: 'var(--t0)',
              border: '1px solid var(--b2)',
              flexShrink: 0,
              width: 140
            }}
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Search box */}
          <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input 
              type="text"
              placeholder="Search name, phone, table..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="d-input"
              style={{
                paddingLeft: 32,
                borderRadius: 20,
                fontSize: 12,
                width: '100%',
                background: 'var(--s1)',
                border: '1px solid var(--b2)'
              }}
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--t2)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          Loading reservations...
        </div>
      ) : bookings.length === 0 ? (
        <div className="card empty-booking-state" style={{ padding: 50, textAlign: 'center' }}>
          <PartyPopper size={48} style={{ color: 'var(--a)', margin: '0 auto 16px', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: 17, color: 'var(--t0)' }}>No Bookings Found</h3>
          <p style={{ margin: 0, color: 'var(--t2)', fontSize: 13, maxWidth: 360, marginInline: 'auto' }}>
            {filterType === 'upcoming' 
              ? 'No upcoming bookings scheduled. Click "New Booking" above to add reservations.' 
              : 'No reservations match your active filter and search terms.'}
          </p>
          <button 
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ marginTop: 20, background: 'var(--a)', color: '#000', fontWeight: 700 }}
          >
            <Plus size={16} /> Add First Booking
          </button>
        </div>
      ) : (
        <div className="bookings-grid">
          {bookings.map(b => {
            const advance = b.advancePayment || 0;
            const estTotal = b.totalAmount || 0;
            const balance = Math.max(0, estTotal - advance);

            return (
              <div key={b._id} className={`booking-card status-${b.status}`}>
                {/* Header */}
                <div className="booking-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="booking-no mono">{b.bookingNo}</span>
                    {getDaysCountdownBadge(b.bookingDate, b.status)}
                  </div>

                  <div className="booking-card-actions">
                    <button 
                      type="button" 
                      className="b-icon-btn btn-print-quick"
                      onClick={() => handlePrintReceipt(b)}
                      title="Print Official Confirmation Receipt"
                    >
                      <Printer size={15} />
                    </button>
                    <button 
                      type="button" 
                      className="b-icon-btn"
                      onClick={() => handleOpenEdit(b)}
                      title="Edit Booking"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button 
                      type="button" 
                      className="b-icon-btn btn-del"
                      onClick={() => handleDeleteBooking(b._id, b.bookingNo)}
                      title="Delete Booking"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="booking-client-info">
                  <div className="client-name">{b.customerName}</div>
                  <a href={`tel:${b.customerPhone}`} className="client-phone">
                    <Phone size={12} />
                    {b.customerPhone}
                  </a>
                </div>

                {/* Event Schedule Badges */}
                <div className="booking-schedule-row">
                  <div className="schedule-badge">
                    <Calendar size={13} style={{ color: 'var(--a)' }} />
                    <span>{formatFriendlyDate(b.bookingDate)}</span>
                  </div>
                  <div className="schedule-badge">
                    <Clock size={13} style={{ color: 'var(--a)' }} />
                    <span>{b.bookingTime || '07:00 PM'}</span>
                  </div>
                  <div className="schedule-badge">
                    <Users size={13} style={{ color: 'var(--a)' }} />
                    <span>{b.guestCount || 1} Guests</span>
                  </div>
                </div>

                {/* Reservation Detail Highlights */}
                <div className="booking-details-box">
                  <div className="detail-item">
                    <span className="d-label">Occasion</span>
                    <span className="d-val">{b.occasion || 'Table Reservation'}</span>
                  </div>
                  {b.tableNo && (
                    <div className="detail-item">
                      <span className="d-label">Reserved Area</span>
                      <span className="d-val">{b.tableNo}</span>
                    </div>
                  )}
                  {b.billingType === 'per_plate' && b.pricePerPlate > 0 && (
                    <div className="detail-item">
                      <span className="d-label">Rate / Plate</span>
                      <span className="d-val">₹{b.pricePerPlate}</span>
                    </div>
                  )}
                  {b.decorationAmount > 0 && (
                    <div className="detail-item">
                      <span className="d-label">Decoration</span>
                      <span className="d-val" style={{ color: 'var(--a)' }}>₹{b.decorationAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {b.notes && (
                  <div className="booking-notes-callout">
                    <Sparkles size={12} style={{ color: 'var(--a)', flexShrink: 0, marginTop: 2 }} />
                    <span>{b.notes}</span>
                  </div>
                )}

                {/* Financial Summary Box */}
                <div className="booking-finance-stack">
                  <div className="finance-row">
                    <span className="f-title">Advance Paid</span>
                    <span className="f-amt advance-amt">₹{advance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="finance-row sub-row">
                    <span>Payment Mode</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {b.advancePaymentMode || 'Cash'}
                      {b.advancePaymentMode === 'split' && ` (C: ₹${b.advanceCashAmount || 0}, U: ₹${b.advanceUpiAmount || 0})`}
                    </span>
                  </div>
                  {b.decorationAmount > 0 && (
                    <div className="finance-row sub-row">
                      <span>Decoration</span>
                      <span>₹{b.decorationAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="finance-row sub-row">
                    <span>Est. Total</span>
                    <span>₹{estTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="finance-row balance-row">
                    <span className="f-title">Remaining Due</span>
                    <span className="f-amt balance-amt">₹{balance.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Status action footer */}
                <div className="booking-card-footer">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {b.status !== 'completed' && (
                      <button 
                        type="button" 
                        className="btn-status-quick complete-btn"
                        onClick={() => handleQuickStatus(b._id, 'completed')}
                      >
                        <Check size={12} /> Mark Completed
                      </button>
                    )}
                    {b.status === 'confirmed' && (
                      <button 
                        type="button" 
                        className="btn-status-quick cancel-btn"
                        onClick={() => handleQuickStatus(b._id, 'cancelled')}
                      >
                        <X size={12} /> Cancel
                      </button>
                    )}
                    {b.status !== 'confirmed' && (
                      <button 
                        type="button" 
                        className="btn-status-quick"
                        onClick={() => handleQuickStatus(b._id, 'confirmed')}
                      >
                        Re-confirm
                      </button>
                    )}
                  </div>

                  <button 
                    type="button"
                    className="btn-print-pill"
                    onClick={() => handlePrintReceipt(b)}
                  >
                    <Printer size={13} />
                    Receipt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NEW / EDIT BOOKING MODAL */}
      {modalOpen && (
        <div className="moverlay" onClick={() => setModalOpen(false)}>
          <div className="mbox booking-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="live-dot" style={{ background: 'var(--a)' }}></div>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--t0)', textTransform: 'uppercase' }}>
                  {editingBooking ? `Edit Booking — ${editingBooking.bookingNo}` : 'New Booking'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--b2)', background: 'var(--s2)', color: 'var(--t1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={e => handleSaveBooking(e, false)}>
              <div className="booking-modal-body" style={{ maxHeight: '76vh', overflowY: 'auto', padding: '14px 16px' }}>

                {/* Row 1: Name + Phone */}
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Customer name"
                      value={formData.customerName}
                      onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                      className="d-input"
                    />
                  </div>
                  <div className="form-field">
                    <label>Phone *</label>
                    <input 
                      type="tel" 
                      required
                      placeholder="Mobile number"
                      value={formData.customerPhone}
                      onChange={e => setFormData({ ...formData, customerPhone: e.target.value })}
                      className="d-input"
                    />
                  </div>
                </div>

                {/* Row 2: Date + Time + Guests */}
                <div className="form-grid-3" style={{ marginTop: 10 }}>
                  <div className="form-field">
                    <label>Date *</label>
                    <input 
                      type="date" 
                      required
                      value={formData.bookingDate}
                      onChange={e => setFormData({ ...formData, bookingDate: e.target.value })}
                      className="d-input"
                    />
                  </div>
                  <div className="form-field">
                    <label>Time</label>
                    <input 
                      type="text" 
                      placeholder="07:30 PM"
                      value={formData.bookingTime}
                      onChange={e => setFormData({ ...formData, bookingTime: e.target.value })}
                      className="d-input"
                    />
                  </div>
                  <div className="form-field">
                    <label>Guests</label>
                    <input 
                      type="number" 
                      min="1"
                      value={formData.guestCount}
                      onChange={e => updateBillingAmounts({ guestCount: e.target.value })}
                      className="d-input"
                    />
                  </div>
                </div>

                {/* Row 3: Occasion + Table */}
                <div className="form-grid-2" style={{ marginTop: 10 }}>
                  <div className="form-field">
                    <label>Occasion</label>
                    <select 
                      value={formData.occasion}
                      onChange={e => setFormData({ ...formData, occasion: e.target.value })}
                      className="d-input"
                    >
                      <option value="Table Reservation">Table Reservation</option>
                      <option value="Birthday Party">Birthday Party</option>
                      <option value="Anniversary">Anniversary</option>
                      <option value="Corporate Event">Corporate Event</option>
                      <option value="Kitty Party">Kitty Party</option>
                      <option value="Family Dinner">Family Dinner</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Table / Area</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Table 4, VIP Lounge"
                      value={formData.tableNo}
                      onChange={e => setFormData({ ...formData, tableNo: e.target.value })}
                      className="d-input"
                    />
                  </div>
                </div>

                {/* Billing type selector */}
                <div style={{ marginTop: 14, marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--a)', marginBottom: 7, borderBottom: '1px solid var(--b1)', paddingBottom: 5 }}>Billing & Advance</div>
                  <div className="billing-type-selector">
                    {[
                      { value: 'table_only', label: '🪑 Table Only', sub: 'Pay as per menu' },
                      { value: 'custom', label: '📋 Custom Amount', sub: 'Fixed food + decor' },
                      { value: 'per_plate', label: '🍽️ Per Plate', sub: 'Rate × Guests' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`billing-type-opt ${formData.billingType === opt.value ? 'active' : ''}`}
                        onClick={() => updateBillingAmounts({ billingType: opt.value })}
                      >
                        <span className="bt-label">{opt.label}</span>
                        <span className="bt-sub">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount inputs — always 3-col row */}
                <div className="form-grid-3" style={{ marginTop: 10 }}>
                  {/* Col 1: food/plate/decoration depends on type */}
                  {formData.billingType === 'table_only' ? (
                    <div className="form-field">
                      <label>Decoration (₹) <span style={{color:'var(--t2)',fontWeight:400}}>optional</span></label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="e.g. 1500"
                        value={formData.decorationAmount}
                        onChange={e => setFormData({ ...formData, decorationAmount: e.target.value })}
                        className="d-input"
                      />
                    </div>
                  ) : formData.billingType === 'per_plate' ? (
                    <div className="form-field">
                      <label>Per Plate (₹)</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="e.g. 850"
                        value={formData.pricePerPlate}
                        onChange={e => updateBillingAmounts({ pricePerPlate: e.target.value })}
                        className="d-input"
                      />
                    </div>
                  ) : (
                    <div className="form-field">
                      <label>Food / Catering (₹)</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="e.g. 10000"
                        value={formData.foodAmount}
                        onChange={e => updateBillingAmounts({ foodAmount: e.target.value })}
                        className="d-input"
                      />
                    </div>
                  )}

                  {/* Col 2: Decoration (only for custom/per_plate) */}
                  {formData.billingType !== 'table_only' && (
                    <div className="form-field">
                      <label>Decoration (₹)</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="e.g. 2000"
                        value={formData.decorationAmount}
                        onChange={e => updateBillingAmounts({ decorationAmount: e.target.value })}
                        className="d-input"
                      />
                    </div>
                  )}

                  {/* Col 3: Advance Payment */}
                  <div className="form-field" style={{ gridColumn: formData.billingType === 'table_only' ? 'span 2' : 'auto' }}>
                    <label style={{ color: 'var(--a)', fontWeight: 700 }}>Advance (₹)</label>
                    <input 
                      type="number" 
                      min="0"
                      placeholder="Amount collected now"
                      value={formData.advancePayment}
                      onChange={e => setFormData({ ...formData, advancePayment: e.target.value })}
                      className="d-input"
                      style={{ borderColor: 'rgba(245,158,11,0.5)' }}
                    />
                  </div>
                </div>

                {/* Estimated total pill — read-only, shown when > 0 */}
                {formData.billingType !== 'table_only' && formData.totalAmount > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>Est. Total:</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--t0)', fontFamily: 'monospace' }}>₹{Number(formData.totalAmount).toLocaleString('en-IN')}</span>
                    {formData.advancePayment > 0 && (
                      <span style={{ fontSize: 11, color: '#F87171', marginLeft: 4 }}>· Due: ₹{Math.max(0, Number(formData.totalAmount) - Number(formData.advancePayment)).toLocaleString('en-IN')}</span>
                    )}
                  </div>
                )}

                {/* Payment mode + date row */}
                <div className="form-grid-2" style={{ marginTop: 10, padding: '10px 12px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--b1)' }}>
                  <div className="form-field">
                    <label>Payment Mode</label>
                    <select 
                      value={formData.advancePaymentMode}
                      onChange={e => setFormData({ ...formData, advancePaymentMode: e.target.value })}
                      className="d-input"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="split">Split (Cash + UPI)</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Advance Date</label>
                    <input 
                      type="date" 
                      value={formData.advancePaymentDate}
                      onChange={e => setFormData({ ...formData, advancePaymentDate: e.target.value })}
                      className="d-input"
                    />
                  </div>
                </div>

                {formData.advancePaymentMode === 'split' && (
                  <div className="form-grid-2" style={{ marginTop: 8 }}>
                    <div className="form-field">
                      <label>Cash (₹)</label>
                      <input type="number" placeholder="Cash amount" value={formData.advanceCashAmount} onChange={e => setFormData({ ...formData, advanceCashAmount: e.target.value })} className="d-input" />
                    </div>
                    <div className="form-field">
                      <label>UPI (₹)</label>
                      <input type="number" placeholder="UPI amount" value={formData.advanceUpiAmount} onChange={e => setFormData({ ...formData, advanceUpiAmount: e.target.value })} className="d-input" />
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="form-field" style={{ marginTop: 10 }}>
                  <label>Notes</label>
                  <textarea 
                    rows="2"
                    placeholder="Music, cake, special requests..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="d-input"
                  />
                </div>
              </div>

              <div className="bm-actions">
                <button 
                  type="button" 
                  className="bm-btn bm-btn-cancel" 
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    type="button" 
                    className="bm-btn bm-btn-print"
                    disabled={formSubmitting}
                    onClick={e => handleSaveBooking(e, true)}
                  >
                    <Printer size={15} />
                    Save & Print Receipt
                  </button>

                  <button 
                    type="submit" 
                    className="bm-btn bm-btn-primary"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Saving...' : (editingBooking ? 'Update Booking' : 'Create Booking')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Styles for Bookings page */}
      <style>{`
        .bookings-page {
          padding: 0;
        }
        .bookings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 14px;
        }
        .bookings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 16px;
        }
        .booking-card {
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all 0.2s ease;
          position: relative;
        }
        .booking-card:hover {
          border-color: var(--a);
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .booking-card.status-cancelled {
          opacity: 0.7;
          filter: grayscale(0.2);
        }
        .booking-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .booking-no {
          font-size: 11px;
          font-weight: 700;
          color: var(--t2);
          background: var(--s2);
          padding: 3px 8px;
          border-radius: 6px;
        }
        .booking-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 12px;
        }
        .badge-upcoming {
          background: rgba(245, 158, 11, 0.15);
          color: var(--a);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .badge-today {
          background: rgba(16, 185, 129, 0.2);
          color: #10B981;
          border: 1px solid rgba(16, 185, 129, 0.4);
        }
        .badge-completed {
          background: rgba(59, 130, 246, 0.15);
          color: #3B82F6;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .badge-cancelled {
          background: rgba(239, 68, 68, 0.15);
          color: #EF4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge-past {
          background: var(--s2);
          color: var(--t2);
        }
        .booking-card-actions {
          display: flex;
          gap: 6px;
        }
        .b-icon-btn {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--b2);
          background: var(--s2);
          color: var(--t1);
          cursor: pointer;
          transition: all 0.15s;
        }
        .b-icon-btn:hover {
          color: var(--t0);
          border-color: var(--a);
        }
        .btn-print-quick:hover {
          color: var(--a);
          background: rgba(245, 158, 11, 0.1);
        }
        .btn-del:hover {
          color: #EF4444;
          border-color: #EF4444;
        }
        .booking-client-info {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .client-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--t0);
        }
        .client-phone {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--a);
          text-decoration: none;
          font-family: monospace;
        }
        .booking-schedule-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .schedule-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          background: var(--s2);
          padding: 4px 10px;
          border-radius: 6px;
          color: var(--t1);
        }
        .booking-details-box {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px 12px;
          background: var(--s2);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
        }
        .detail-item {
          display: flex;
          justify-content: space-between;
        }
        .d-label {
          color: var(--t2);
        }
        .d-val {
          font-weight: 600;
          color: var(--t0);
        }
        .booking-notes-callout {
          display: flex;
          gap: 6px;
          font-size: 11px;
          color: var(--t1);
          background: rgba(245, 158, 11, 0.06);
          border-left: 2px solid var(--a);
          padding: 6px 10px;
          border-radius: 0 6px 6px 0;
        }
        .booking-finance-stack {
          border-top: 1px dashed var(--b1);
          padding-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
        }
        .finance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .finance-row.sub-row {
          font-size: 11px;
          color: var(--t2);
        }
        .finance-row.balance-row {
          border-top: 1px solid var(--b2);
          padding-top: 5px;
          margin-top: 2px;
        }
        .f-title {
          font-weight: 600;
        }
        .f-amt {
          font-family: monospace;
          font-weight: 700;
        }
        .advance-amt {
          color: #10B981;
          font-size: 14px;
        }
        .balance-amt {
          color: var(--t0);
          font-size: 14px;
        }
        .booking-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid var(--b1);
          margin-top: auto;
        }
        .btn-status-quick {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--b2);
          background: var(--s2);
          color: var(--t1);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .btn-status-quick.complete-btn:hover {
          color: #10B981;
          border-color: #10B981;
        }
        .btn-status-quick.cancel-btn:hover {
          color: #EF4444;
          border-color: #EF4444;
        }
        .btn-print-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          color: var(--a);
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          padding: 5px 12px;
          border-radius: 16px;
          cursor: pointer;
        }
        .btn-print-pill:hover {
          background: var(--a);
          color: #000;
        }
        /* KPI Cards */
        .bookings-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 16px;
        }
        .booking-kpi-card {
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: box-shadow 0.2s;
        }
        .booking-kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
        .booking-kpi-header { display: flex; justify-content: space-between; align-items: center; }
        .booking-kpi-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--t2);
        }
        .booking-kpi-icon-pill {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .booking-kpi-value {
          font-size: 26px;
          font-weight: 900;
          line-height: 1.1;
          letter-spacing: -0.5px;
        }
        .booking-kpi-sub {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--t2);
          margin-top: 2px;
        }
        .kpi-indicator { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* Modal action buttons */
        .bm-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px;
          border-top: 1px solid var(--b1);
          background: var(--s1);
          border-radius: 0 0 14px 14px;
        }
        .bm-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 18px;
          border-radius: 8px;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .bm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .bm-btn-cancel {
          background: var(--s2);
          color: var(--t1);
          border: 1px solid var(--b2);
        }
        .bm-btn-cancel:hover { background: var(--b1); color: var(--t0); }
        .bm-btn-print {
          background: rgba(245,158,11,0.1);
          color: var(--a);
          border: 1px solid rgba(245,158,11,0.35);
        }
        .bm-btn-print:hover:not(:disabled) {
          background: rgba(245,158,11,0.2);
        }
        .bm-btn-primary {
          background: linear-gradient(135deg, var(--a), #d97706);
          color: #000;
          font-weight: 700;
          box-shadow: 0 3px 10px rgba(245,158,11,0.28);
        }
        .bm-btn-primary:hover:not(:disabled) {
          box-shadow: 0 4px 16px rgba(245,158,11,0.45);
          transform: translateY(-1px);
        }

        .form-grid-1 { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .modal-section-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--a);
          margin: 0 0 8px 0;
          font-weight: 700;
          padding-bottom: 5px;
          border-bottom: 1px solid var(--b1);
        }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-field label { font-size: 11px; color: var(--t1); font-weight: 500; }

        /* Date picker icon visible in dark mode */
        .booking-modal input[type="date"],
        .booking-modal input[type="time"] {
          color-scheme: dark;
        }
        .lm .booking-modal input[type="date"],
        .lm .booking-modal input[type="time"] {
          color-scheme: light;
        }

        /* Billing type selector */
        .billing-type-selector {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 4px;
        }
        .billing-type-opt {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 9px 10px;
          border-radius: 8px;
          border: 1.5px solid var(--b2);
          background: var(--s2);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }
        .billing-type-opt:hover {
          border-color: var(--a);
        }
        .billing-type-opt.active {
          border-color: var(--a);
          background: rgba(245,158,11,0.1);
        }
        .bt-label {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--t0);
        }
        .billing-type-opt.active .bt-label { color: var(--a); }
        .bt-sub {
          font-size: 10px;
          color: var(--t2);
          line-height: 1.3;
        }

        @media (max-width: 900px) {
          .bookings-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .bookings-kpi-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .form-grid-2, .form-grid-3 { grid-template-columns: 1fr; }
          .billing-type-selector { grid-template-columns: 1fr; }
          .bm-actions { flex-direction: column-reverse; gap: 8px; }
          .bm-btn { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
