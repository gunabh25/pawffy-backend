const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateTime(date, time) {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

function formatAppointmentId(bookingId) {
  return `APT${bookingId.replace(/-/g, "").toUpperCase().slice(0, 10)}`;
}

module.exports = { formatDateTime, formatAppointmentId };
