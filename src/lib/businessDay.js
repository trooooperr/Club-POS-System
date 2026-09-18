/**
 * businessDay.js
 * Shared helper for computing the "business day" boundary.
 * HumTum operates past midnight, so we define a new day as starting at 5 AM.
 * Orders before 5 AM belong to the previous calendar day's business.
 *
 * IMPORTANT: The backend runs on Render (UTC). All hour checks use IST
 * (UTC+5:30) so the 5 AM boundary is correct regardless of server timezone.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30

/**
 * Returns the current hour in IST (0-23), regardless of server timezone.
 * @param {Date} [date] - Date to check (defaults to now)
 * @returns {number}
 */
function getISTHour(date = new Date()) {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  return istTime.getUTCHours();
}

/**
 * Returns the start of the current business day (5 AM IST boundary).
 * If the current IST time is before 5 AM, it returns yesterday's 5 AM IST.
 *
 * @returns {Date} Start of current business day (in UTC)
 */
function getBusinessDayBoundary() {
  const now = new Date();
  const istHour = getISTHour(now);

  // Build today's 5:00 AM IST in UTC: midnight IST = UTC - 5:30, then add 5h
  // So 5:00 AM IST = 5:00 - 5:30 = previous day 23:30 UTC
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const boundary = new Date(Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    5, 0, 0, 0
  ));
  // Convert boundary from IST back to UTC
  boundary.setTime(boundary.getTime() - IST_OFFSET_MS);

  if (istHour < 5) {
    boundary.setUTCDate(boundary.getUTCDate() - 1);
  }
  return boundary;
}

/**
 * Returns { start, end } for the current business day.
 * start = 5 AM IST today (or yesterday if before 5 AM IST now)
 * end   = 5 AM IST tomorrow (i.e., 24 hours after start)
 *
 * @returns {{ start: Date, end: Date }}
 */
function getBusinessDayBounds() {
  const start = getBusinessDayBoundary();
  const end   = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getBusinessDateString(date = new Date()) {
  const d = new Date(date);
  const istTime = new Date(d.getTime() + IST_OFFSET_MS);

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
}

function getBusinessDayBoundsForDate(dateStr) {
  if (!dateStr) return getBusinessDayBounds();
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

module.exports = { getBusinessDayBoundary, getBusinessDayBounds, getBusinessDayBoundsForDate, getISTHour, getBusinessDateString };

