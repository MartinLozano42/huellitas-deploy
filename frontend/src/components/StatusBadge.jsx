const labels = {
  PENDIENTE: 'Pendiente',
  ATENDIDO: 'Atendido',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  SUSPENDIDO: 'Suspendido',
  ACTIVO: 'Activo',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
  DESACTIVADO: 'Desactivado',
  EN_CASA: 'En casa',
  PERDIDA: 'Perdida',
  ENCONTRADA: 'Encontrada',
  SI: 'Sí',
  NO: 'No'
};

export default function StatusBadge({ value }) {
  if (!value) return null;
  const cls = value.toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge ${cls}`}>{labels[value] || value}</span>;
}
