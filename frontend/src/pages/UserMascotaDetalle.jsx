import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Download, MapPin, QrCode, Pencil, Image as ImageIcon } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { mediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

const SUCURSALES = ['Sucursal Central', 'Sucursal Norte', 'Sucursal Sur'];

function PawPrintFallback() { return <span aria-hidden="true">🐾</span>; }

function pickupKey(qrId) {
  return `huellitas_pickup_${qrId}`;
}

export default function UserMascotaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pet, setPet] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');
  const [pickupOpen, setPickupOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [qrImage, setQrImage] = useState(null);

  async function load() {
    try {
      const { data } = await api.get(`/user/mascotas/${id}`);
      setPet(data);
      setError('');
      const approved = data.qrs?.find((q) => ['APROBADO', 'ACTIVO'].includes(q.estado));
      setQrImage(null);
      setSelectedBranch(approved ? localStorage.getItem(pickupKey(approved.id)) || '' : '');
      if (approved) {
        try {
          const { data: qrData } = await api.get(`/user/qr/${approved.id}/imagen`);
          setQrImage(qrData.qrDataUrl);
        } catch (qrError) {
          setError(qrError.response?.data?.message || 'No se pudo generar el QR.');
        }
      }
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo cargar la mascota.');
    }
  }

  useEffect(() => { load(); }, [id]);

  async function requestQr() {
    try {
      const { data } = await api.post(`/user/mascotas/${id}/qr`);
      setMessage(data.message);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo solicitar el QR.');
    }
  }

  async function downloadQr(qr) {
    if (!qrImage) return;
    setDownloading(true);
    setError('');
    try {
      const link = document.createElement('a');
      link.href = qrImage;
      link.download = `Huellitas-${pet.nombre}-${qr.codigo}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(e.message || 'No se pudo descargar el QR.');
    } finally {
      setDownloading(false);
    }
  }

  function openPickup(qr) {
    setSelectedBranch(localStorage.getItem(pickupKey(qr.id)) || '');
    setPickupOpen(true);
  }

  function savePickup(qr) {
    if (!selectedBranch) {
      setError('Selecciona una sucursal.');
      return;
    }
    localStorage.setItem(pickupKey(qr.id), selectedBranch);
    setMessage(`Retiro seleccionado en ${selectedBranch}.`);
    setPickupOpen(false);
  }

  function removePickup(qr) {
    localStorage.removeItem(pickupKey(qr.id));
    setSelectedBranch('');
    setMessage('Se quitó la selección de retiro en sucursal.');
  }

  const approvedQr = useMemo(
    () => pet?.qrs?.find((q) => ['APROBADO', 'ACTIVO'].includes(q.estado)),
    [pet]
  );

  if (!pet) {
    return <div>{error ? <div className="alert error">{error}</div> : <div className="loading">Cargando...</div>}</div>;
  }

  const pickupBranch = approvedQr ? localStorage.getItem(pickupKey(approvedQr.id)) || '' : '';

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="icon-button" onClick={() => navigate('/usuario/mascotas')} type="button">
            <ArrowLeft size={17} />
          </button>
          <h1 style={{ marginTop: 12 }}>{pet.nombre}</h1>
          <p>{pet.especie} · {pet.raza || 'Sin raza'}</p>
        </div>

        <div className="pet-detail-header-actions"><button className="secondary-button compact" type="button" onClick={() => navigate(`/usuario/mascotas/${id}/editar`)}><Pencil size={15}/>Editar mascota</button><button className="secondary-button compact" type="button" onClick={() => navigate(`/usuario/afiches?mascota=${id}`)}><ImageIcon size={15}/>Crear afiche</button>{!approvedQr && (
          <button className="primary-button" onClick={requestQr} type="button">
            <QrCode size={17} />
            Solicitar QR
          </button>
        )}</div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        <div className="modal-body">
          <div className="pet-detail-head">
            <div className="pet-avatar big">{pet.foto ? <img src={mediaUrl(pet.foto)} alt={pet.nombre} /> : <PawPrintFallback />}</div>
            <div>
              <h2>{pet.nombre}</h2>
              <p>{pet.especie} · {pet.raza || 'Sin raza'}</p>
              <StatusBadge value={pet.estado} />
            </div>
          </div>

          <div className="detail-grid">
            <div><span className="detail-label">Sexo</span><strong>{pet.sexo || '—'}</strong></div>
            <div><span className="detail-label">Edad</span><strong>{pet.edad} años</strong></div>
            <div><span className="detail-label">Vacunado</span><StatusBadge value={pet.vacunado} /></div>
            <div className="full-span">
              <span className="detail-label">Características</span>
              <p className="detail-text">{pet.caracteristicas || 'Sin características registradas.'}</p>
            </div>

            <div className="full-span">
              <span className="detail-label">Identificación QR</span>
              {approvedQr ? (
                <div className="qr-user-card">
                  <div className="qr-user-preview">
                    {qrImage ? (
                      <img src={qrImage} alt={`Código QR de ${pet.nombre}`} />
                    ) : (
                      <div className="qr-generating">Generando QR...</div>
                    )}
                  </div>
                  <div className="qr-user-info">
                    <div className="qr-user-code-row">
                      <strong>{approvedQr.codigo}</strong>
                      <StatusBadge value={approvedQr.estado} />
                    </div>
                    <p>Este es el QR oficial de {pet.nombre}. Puedes descargarlo para imprimirlo o elegir recogerlo físicamente en una sucursal.</p>
                    <div className="qr-user-actions">
                      <button className="primary-button compact" type="button" onClick={() => downloadQr(approvedQr)} disabled={downloading || !qrImage}>
                        <Download size={15} />
                        {downloading ? 'Descargando...' : 'Descargar QR'}
                      </button>
                      <button className="secondary-button compact" type="button" onClick={() => openPickup(approvedQr)}>
                        <MapPin size={15} />
                        Recoger en sucursal
                      </button>
                    </div>
                    {pickupBranch ? (
                      <div className="qr-delivery-note">
                        <MapPin size={15} />
                        <span>Retiro seleccionado: <strong>{pickupBranch}</strong></span>
                        <button className="link-button" type="button" onClick={() => openPickup(approvedQr)}>Cambiar</button>
                        <button className="link-button" type="button" onClick={() => removePickup(approvedQr)}>Quitar</button>
                      </div>
                    ) : (
                      <div className="qr-delivery-note neutral">
                        <Check size={15} />
                        <span>Entrega actual: <strong>Digital</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              ) : pet.qrs?.length ? (
                <div className="mini-list">
                  {pet.qrs.map((q) => (
                    <div className="list-row" key={q.id}>
                      <div>
                        <strong>{q.codigo}</strong>
                        <span className="muted">Solicitud enviada</span>
                      </div>
                      <StatusBadge value={q.estado} />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="muted">Todavía no tiene una solicitud QR.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal open={pickupOpen} title="Recoger QR en una sucursal" onClose={() => setPickupOpen(false)}>
        <p className="detail-text" style={{ marginBottom: 14 }}>
          Selecciona dónde deseas retirar físicamente la identificación QR de {pet.nombre}.
        </p>
        <div className="branch-list">
          {SUCURSALES.map((branch) => (
            <button
              key={branch}
              type="button"
              className={`branch-option ${selectedBranch === branch ? 'selected' : ''}`}
              onClick={() => setSelectedBranch(branch)}
            >
              <MapPin size={18} />
              <span>{branch}</span>
              {selectedBranch === branch && <Check size={17} />}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={() => setPickupOpen(false)}>Cancelar</button>
          <button className="primary-button" type="button" onClick={() => savePickup(approvedQr)} disabled={!selectedBranch}>
            <Check size={16} />
            Confirmar retiro
          </button>
        </div>
      </Modal>
    </div>
  );
}
