import { useCallback, useEffect, useState } from 'react';
import { Eye, Search, RefreshCw, PawPrint, X } from 'lucide-react';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function Mascotas() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [selected, setSelected] = useState(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    setError('');

    if (showRefresh) {
      setSearching(true);
    } else {
      setLoading(true);
    }

    try {
      const { data } = await api.get('/admin/mascotas', {
        params: {
          search: search.trim(),
          estado
        }
      });

      if (!Array.isArray(data)) {
        throw new Error('La respuesta del servidor no tiene el formato esperado.');
      }

      setRows(data);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudieron cargar las mascotas.'
      );
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [search, estado]);

  useEffect(() => {
    load();
  }, [estado, load]);

  async function view(id) {
    if (!id || detailLoading) return;

    setError('');
    setDetailLoading(true);

    try {
      const { data } = await api.get(`/admin/mascotas/${id}`);
      setSelected(data);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo cargar el detalle de la mascota.'
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function handleSearch(event) {
    event?.preventDefault();
    load(true);
  }

  function clearSearch() {
    setSearch('');
    setEstado('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Base de mascotas</h1>
          <p>
            Consulta las mascotas registradas y su relación con cada propietario.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <form className="toolbar" onSubmit={handleSearch}>
        <div className="search-box">
          <Search size={18} />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar mascota, raza, propietario o CI..."
            aria-label="Buscar mascotas"
          />

          {search && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setSearch('')}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="EN_CASA">En casa</option>
          <option value="PERDIDA">Perdidas</option>
          <option value="ENCONTRADA">Encontradas</option>
        </select>

        <button
          className="secondary-button"
          type="submit"
          disabled={searching}
        >
          <Search size={16} />
          {searching ? 'Buscando...' : 'Buscar'}
        </button>

        <button
          className="secondary-button"
          type="button"
          onClick={() => load(true)}
          disabled={searching}
          title="Actualizar resultados"
        >
          <RefreshCw size={16} />
        </button>
      </form>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mascota</th>
                <th>Especie / raza</th>
                <th>Propietario</th>
                <th>Vacunado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!loading && rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="pet-cell">
                      <div className="pet-avatar">
                        {m.foto ? (
                          <img
                            src={mediaUrl(m.foto)}
                            alt={m.nombre}
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <PawPrint size={20} />
                        )}
                      </div>

                      <div>
                        <strong>{m.nombre || 'Sin nombre'}</strong>
                        <span>
                          {m.sexo
                            ? m.sexo.toLowerCase()
                            : 'Sin sexo'}
                          {' · '}
                          {m.edad ?? '—'} años
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    {m.especie || '—'}
                    <br />
                    <span className="muted">
                      {m.raza || 'Sin raza'}
                    </span>
                  </td>

                  <td>
                    <strong>{m.propietario || 'Sin propietario'}</strong>
                    <span className="muted">{m.ci || '—'}</span>
                  </td>

                  <td>
                    <StatusBadge value={m.vacunado} />
                  </td>

                  <td>
                    <StatusBadge value={m.estado} />
                  </td>

                  <td>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => view(m.id)}
                      title="Ver detalle"
                      aria-label={`Ver detalles de ${m.nombre}`}
                      disabled={detailLoading}
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="loading">
            Cargando base de mascotas...
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <PawPrint size={32} />

            <p>
              No hay mascotas que coincidan con los filtros.
            </p>

            {(search || estado) && (
              <button
                type="button"
                className="secondary-button"
                onClick={clearSearch}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="user-pets-toolbar">
            <span>
              {rows.length} {rows.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalle de mascota"
        wide
      >
        {selected && (
          <div className="pet-detail">
            <div className="pet-detail-head">
              <div className="pet-avatar big">
                {selected.foto ? (
                  <img
                    src={mediaUrl(selected.foto)}
                    alt={selected.nombre}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <PawPrint size={32} />
                )}
              </div>

              <div>
                <h2>{selected.nombre}</h2>
                <p>
                  {selected.especie}
                  {' · '}
                  {selected.raza || 'Sin raza'}
                </p>
                <StatusBadge value={selected.estado} />
              </div>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">Sexo</span>
                <strong>{selected.sexo || '—'}</strong>
              </div>

              <div>
                <span className="detail-label">Edad</span>
                <strong>{selected.edad ?? '—'} años</strong>
              </div>

              <div>
                <span className="detail-label">Vacunado</span>
                <StatusBadge value={selected.vacunado} />
              </div>

              <div>
                <span className="detail-label">Propietario</span>
                <strong>{selected.propietario || '—'}</strong>
              </div>

              <div>
                <span className="detail-label">CI</span>
                <strong>{selected.ci || '—'}</strong>
              </div>

              <div>
                <span className="detail-label">Teléfono</span>
                <strong>{selected.telefono || '—'}</strong>
              </div>

              <div className="full-span">
                <span className="detail-label">Características</span>
                <p className="detail-text">
                  {selected.caracteristicas ||
                    'Sin características registradas.'}
                </p>
              </div>

              <div className="full-span">
                <span className="detail-label">
                  Identificaciones QR
                </span>

                {selected.qrs?.length ? (
                  <div className="mini-list">
                    {selected.qrs.map((q) => (
                      <div className="list-row" key={q.id}>
                        <span>{q.codigo}</span>
                        <StatusBadge value={q.estado} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">
                    No tiene solicitudes QR.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
