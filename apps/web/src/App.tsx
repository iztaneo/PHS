import { useEffect, useState } from 'react';

interface ServiceStatus {
  service: string;
  status: 'ok' | 'degraded' | 'unreachable';
  database?: 'ok' | 'down';
}

interface SystemStatus {
  status: 'ok' | 'degraded';
  services: ServiceStatus[];
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: SystemStatus };

const STATUS_TEXT: Record<ServiceStatus['status'], string> = {
  ok: 'Disponible',
  degraded: 'Con problemas',
  unreachable: 'Sin respuesta',
};

export function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<SystemStatus>;
      })
      .then((data) => setLoad({ state: 'ready', data }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <h1>Project Health System</h1>
      <p>Esqueleto de la aplicación. Estado de los servicios a través del gateway:</p>
      {load.state === 'loading' && <p>Consultando…</p>}
      {load.state === 'error' && <p role="alert">No se pudo contactar al gateway.</p>}
      {load.state === 'ready' && (
        <ul>
          {load.data.services.map((service) => (
            <li key={service.service}>
              <strong>{service.service}</strong>: {STATUS_TEXT[service.status]}
              {service.database && ` · base de datos ${service.database === 'ok' ? 'conectada' : 'sin conexión'}`}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
