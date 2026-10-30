import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  FileWarning,
  MapPin,
  PawPrint,
  Search,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

function BarList({ title, subtitle, items, emptyText = 'Sin datos todavía.' }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="chart-card panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="chart-body">
        {items.every((item) => item.value === 0) ? (
          <div className="chart-empty">{emptyText}</div>
        ) : (
          items.map((item) => (
            <div className="bar-row" key={item.label}>
              <div className="bar-label">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${Math.max((item.value / max) * 100, item.value ? 8 : 0)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Reportes() {
  const [params, setParams] = useSearchParams();

  const vista = params.get('vista') || 'casos';
  const tipoParam = params.get('tipo') || '';
  const estadoParam = params.get('estado') || '';

  const [rows, setRows] = useState([]);
  const [tipo, setTipo] = useState(tipoParam);
  const [estado, setEstado] = useState(estadoParam);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(nextTipo = tipo, nextEstado = estado) {
    try {
      const { data } = await api.get('/admin/reportes', {
        params: { tipo: nextTipo, estado: nextEstado },
      });
      setRows(data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar los reportes.');
    }
  }

  useEffect(() => {
    setTipo(tipoParam);
    setEstado(estadoParam);
    load(tipoParam, estadoParam);
  }, [vista, tipoParam, estadoParam]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      activos: rows.filter((r) => r.estado === 'ACTIVO').length,
      resueltos: rows.filter((r) => r.estado === 'RESUELTO').length,
      cerrados: rows.filter((r) => r.estado === 'CERRADO').length,
      perdidas: rows.filter((r) => r.tipo === 'PERDIDA').length,
      encontradas: rows.filter((r) => r.tipo === 'ENCONTRADA').length,
    }),
    [rows]
  );

  const speciesCounts = useMemo(() => {
    const values = { PERRO: 0, GATO: 0, OTRO: 0 };
    rows.forEach((row) => {
      if (values[row.especie] !== undefined) values[row.especie] += 1;
    });
    return values;
  }, [rows]);

  const typeChart = [
    { label: 'Perdidas', value: counts.perdidas },
    { label: 'Encontradas', value: counts.encontradas },
  ];

  const statusChart = [
    { label: 'Activos', value: counts.activos },
    { label: 'Resueltos', value: counts.resueltos },
    { label: 'Cerrados', value: counts.cerrados },
  ];

  const speciesChart = [
    { label: 'Perros', value: speciesCounts.PERRO },
    { label: 'Gatos', value: speciesCounts.GATO },
    { label: 'Otros', value: speciesCounts.OTRO },
  ];

  async function setStatus(id, next) {
    try {
      const { data } = await api.patch(`/admin/reportes/${id}/estado`, { estado: next });
      setMessage(data.message);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo actualizar el reporte.');
    }
  }

  function applyFilters() {
    const next = { vista: 'casos' };
    if (tipo) next.tipo = tipo;
    if (estado) next.estado = estado;
    setParams(next);
  }

  function clearFilters() {
    setTipo('');
    setEstado('');
    setParams({ vista: 'casos' });
  }

  function selectTipo(nextTipo) {
    setTipo(nextTipo);
    setParams({
      vista: 'casos',
      ...(nextTipo ? { tipo: nextTipo } : {}),
      ...(estado ? { estado } : {}),
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title-row">
            {vista === 'estadisticas' ? <BarChart3 size={28} /> : <PawPrint size={28} />}
            <h1>{vista === 'estadisticas' ? 'Estadísticas' : 'Casos'}</h1>
          </div>
          <p>
            {vista === 'estadisticas'
              ? 'Resumen visual de los casos registrados en Huellitas.'
              : 'Gestiona y supervisa los casos reportados por la comunidad.'}
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {vista === 'estadisticas' ? (
        <>
          <div className="mini-stats stats-6">
            <div><span>Total de casos</span><strong>{counts.total}</strong></div>
            <div><span>Perdidas</span><strong>{counts.perdidas}</strong></div>
            <div><span>Encontradas</span><strong>{counts.encontradas}</strong></div>
            <div><span>Activos</span><strong>{counts.activos}</strong></div>
            <div><span>Resueltos</span><strong>{counts.resueltos}</strong></div>
            <div><span>Cerrados</span><strong>{counts.cerrados}</strong></div>
          </div>

          <div className="charts-grid">
            <BarList
              title="Casos por tipo"
              subtitle="Comparación entre pérdidas y hallazgos."
              items={typeChart}
            />
            <BarList
              title="Estado de los casos"
              subtitle="Situación actual de los reportes."
              items={statusChart}
            />
            <BarList
              title="Casos por especie"
              subtitle="Distribución según la especie registrada."
              items={speciesChart}
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Resumen general</h2>
                <p>Indicadores calculados con los reportes almacenados.</p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Indicador</th><th>Cantidad</th></tr>
                </thead>
                <tbody>
                  <tr><td>Casos totales</td><td><strong>{counts.total}</strong></td></tr>
                  <tr><td>Mascotas perdidas</td><td><strong>{counts.perdidas}</strong></td></tr>
                  <tr><td>Mascotas encontradas</td><td><strong>{counts.encontradas}</strong></td></tr>
                  <tr><td>Casos activos</td><td><strong>{counts.activos}</strong></td></tr>
                  <tr><td>Casos resueltos</td><td><strong>{counts.resueltos}</strong></td></tr>
                  <tr><td>Casos cerrados</td><td><strong>{counts.cerrados}</strong></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="case-tabs" aria-label="Filtro de casos">
            <button
              className={`case-tab ${!tipo ? 'active' : ''}`}
              type="button"
              onClick={() => selectTipo('')}
            >
              Todos
            </button>
            <button
              className={`case-tab ${tipo === 'PERDIDA' ? 'active' : ''}`}
              type="button"
              onClick={() => selectTipo('PERDIDA')}
            >
              Perdidas
            </button>
            <button
              className={`case-tab ${tipo === 'ENCONTRADA' ? 'active' : ''}`}
              type="button"
              onClick={() => selectTipo('ENCONTRADA')}
            >
              Encontradas
            </button>
          </div>

          <div className="mini-stats">
            <div><span>Casos visibles</span><strong>{counts.total}</strong></div>
            <div><span>Activos</span><strong>{counts.activos}</strong></div>
            <div><span>Resueltos</span><strong>{counts.resueltos}</strong></div>
            <div><span>Cerrados</span><strong>{counts.cerrados}</strong></div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <Search size={18} />
              <span className="muted">Filtros de casos</span>
            </div>

            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activos</option>
              <option value="RESUELTO">Resueltos</option>
              <option value="CERRADO">Cerrados</option>
            </select>

            <button className="secondary-button" type="button" onClick={applyFilters}>Aplicar</button>
            <button className="icon-button" type="button" onClick={clearFilters} title="Limpiar filtros">
              <X size={16} />
            </button>
          </div>

          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reporte</th>
                    <th>Mascota</th>
                    <th>Reportante</th>
                    <th>Ubicación</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="report-cell">
                          <div className={`report-icon ${r.tipo.toLowerCase()}`}>
                            {r.tipo === 'PERDIDA' ? <FileWarning size={18} /> : <Check size={18} />}
                          </div>
                          <div>
                            <strong>{r.tipo === 'PERDIDA' ? 'Mascota perdida' : 'Mascota encontrada'}</strong>
                            <span>{new Date(r.fecha_reporte).toLocaleString('es-BO')}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{r.mascota}</strong>
                        <span className="muted">{r.especie} · {r.raza || 'Sin raza'}</span>
                      </td>
                      <td>
                        <strong>{r.reportante}</strong>
                        <span className="muted">{r.email}</span>
                      </td>
                      <td>
                        <span className="location"><MapPin size={15} />{r.ubicacion || 'Ubicación no indicada'}</span>
                      </td>
                      <td><StatusBadge value={r.estado} /></td>
                      <td>
                        <div className="action-row">
                          {r.estado === 'ACTIVO' && (
                            <button className="secondary-button compact" type="button" onClick={() => setStatus(r.id, 'RESUELTO')}>
                              <Check size={15} />Resolver
                            </button>
                          )}
                          {r.estado !== 'CERRADO' && (
                            <button className="icon-button danger" type="button" onClick={() => setStatus(r.id, 'CERRADO')} title="Cerrar">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <div className="empty-state">No hay casos para los filtros seleccionados.</div>}
          </div>
        </>
      )}
    </div>
  );
}
