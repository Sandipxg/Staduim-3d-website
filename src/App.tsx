import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StadiumEngine } from './engine/StadiumEngine';
import { api, decodeStatuses } from './lib/api';
import { layout } from './lib/layout';
import { useStadium } from './store/useStadium';
import { Panel } from './components/Panel';
import { Hint, Loader, RotatePrompt, TicketModal, Tip, TopBar } from './components/Overlays';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Create the 3D engine once and wire its events into the store.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const set = useStadium.setState;
    const engine = new StadiumEngine(canvas, layout, {
      onState: s => set({ mode: s.mode, stand: s.stand, block: s.block, seat: s.seat }),
      onBusy: busy => set({ busy }),
      onTip: tip => set({ tip }),
      onFlash: msg => useStadium.getState().flashHint(msg),
    });
    set({ engine });
    let cancelled = false;
    engine.init((label, fraction) => set({ progress: { label, fraction } })).then(() => {
      if (cancelled) return;
      const st = useStadium.getState();
      engine.setStatuses(st.statuses);
      engine.setNight(st.night);
      set({ ready: true });
      setTimeout(() => engine.intro(), 250);
    });
    return () => { cancelled = true; engine.dispose(); set({ engine: null }); };
  }, []);

  // Live seat inventory from the API; refreshes every 15 s so other people's bookings show up.
  const seats = useQuery({ queryKey: ['seats'], queryFn: api.seats, refetchInterval: 15_000 });
  useEffect(() => {
    if (seats.data) useStadium.getState().setStatuses(decodeStatuses(seats.data.statuses));
  }, [seats.data]);
  useEffect(() => {
    if (seats.isError) useStadium.getState().flashHint('Live availability is offline. Showing the last known seats.');
  }, [seats.isError]);

  // Esc closes the ticket or steps back one level.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useStadium.getState();
      if (st.booking) useStadium.setState({ booking: null }); else st.engine?.back();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <canvas id="scene" ref={canvasRef} aria-label="3D model of Meridian Arena. Pick a stand, a block and a seat." />
      <div className="vignette" aria-hidden="true" />
      <TopBar />
      <Panel />
      <Hint />
      <Tip />
      <TicketModal />
      <Loader />
      <RotatePrompt />
    </>
  );
}
