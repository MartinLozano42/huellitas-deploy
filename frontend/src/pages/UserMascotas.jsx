import { useCallback, useEffect, useState } from 'react';
import {
  PlusCircle,
  QrCode,
  PawPrint,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function UserMascotas() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestingQr, setRequestingQr] = useState(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { data } = await api.get('/user/mascotas');

      if (!Array.isArray(data)) {
        throw new Error('La respuesta del servidor no tiene el formato esperado.');
      }

      setRows(data);
      setError('');
    } catch (e) {
      setError(
        e.response?.data?.message ||
        e.message ||
        'No se pudieron cargar tus mascotas.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function requestQr(id) {
    if (!id || requestingQr !== null) return;

    setMessage('');
    setError('');
    setRequestingQr(id);

    try {
      const { data } = await api.post(`/user/mascotas/${id}/qr`);

      setMessage(data?.message || 'La solicitud de identificación QR fue enviada correctamente.');

      await load(true);
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'No se pudo solicitar la identificación QR. Inténtalo nuevamente.'
      );
    } finally {
      setRequestingQr(null);
    }
  }

  function getAgeLabel(age) {
    if (age === null || age === undefined || age === '') {
      return 'No especificada';
    }

    const value = Number(age);

    if (!Number.isFinite(value)) {
      return 'No especificada';
    }

    return `${value} ${value === 1 ? 'año' : 'años'}`;
  }

  function getVaccinationLabel(value) {
    if (value === null || value === undefined || value === '') {
      return 'No especificado';
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    const normalized = String(value).toLowerCase();

    if (['si', 'sí', '1', 'true', 'vacunado'].includes(normalized)) {
      return 'Sí';
    }

    if (['no', '0', 'false', 'no vacunado'].includes(normalized)) {
      return 'No';
    }

    return String(value);
  }

  return (
    <div className="user-mascotas-page">
      <div className="page-header">
        <div>
          <h1>Mis mascotas</h1>
          <p>Administra los datos y las identificaciones de tus mascotas.</p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate('/usuario/mascotas/nueva')}
        >
          <PlusCircle size={17} />
          Registrar mascota
        </button>
      </div>

      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading" role="status">
          Cargando tus mascotas...
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <PawPrint size={38} />

          <h2>Aún no tienes mascotas registradas</h2>

          <p>
            Registra a tu mascota para administrar su información,
            generar afiches y solicitar su identificación QR.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() => navigate('/usuario/mascotas/nueva')}
          >
            <PlusCircle size={17} />
            Registrar mi primera mascota
          </button>
        </div>
      ) : (
        <>
          <div className="user-pets-toolbar">
            <span>
              {rows.length} {rows.length === 1 ? 'mascota registrada' : 'mascotas registradas'}
            </span>

            <button
              type="button"
              className="secondary-button compact"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw
                size={15}
                className={refreshing ? 'spin' : ''}
              />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          <div className="user-pet-grid">
            {rows.map((m) => (
              <article className="user-pet-card" key={m.id}>
                <div className="user-pet-avatar">
                  {m.foto ? (
                    <img
                      src={mediaUrl(m.foto)}
                      alt={`Fotografía de ${m.nombre}`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <PawPrint size={28} />
                  )}
                </div>

                <div className="user-pet-main">
                  <div className="user-pet-title">
                    <div>
                      <h2>{m.nombre}</h2>
                      <p>
                        {m.especie || 'Especie no especificada'}
                        {' · '}
                        {m.raza || 'Sin raza especificada'}
                      </p>
                    </div>

                    <StatusBadge value={m.estado} />
                  </div>

                  <div className="user-pet-meta">
                    <span>
                      Sexo: {m.sexo || 'No especificado'}
                    </span>

                    <span>
                      Edad: {getAgeLabel(m.edad)}
                    </span>

                    <span>
                      Vacunado: {getVaccinationLabel(m.vacunado)}
                    </span>
                  </div>

                  <div className="user-pet-actions">
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => navigate(`/usuario/mascotas/${m.id}`)}
                    >
                      Ver detalle
                    </button>

                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => navigate(`/usuario/mascotas/${m.id}/editar`)}
                    >
                      <Pencil size={14} />
                      Editar
                    </button>

                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => navigate(`/usuario/afiches?mascota=${m.id}`)}
                    >
                      <ImageIcon size={14} />
                      Crear afiche
                    </button>

                    <button
                      type="button"
                      className="primary-button compact"
                      onClick={() => requestQr(m.id)}
                      disabled={requestingQr !== null}
                    >
                      <QrCode size={15} />

                      {requestingQr === m.id
                        ? 'Solicitando...'
                        : 'Solicitar QR'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
