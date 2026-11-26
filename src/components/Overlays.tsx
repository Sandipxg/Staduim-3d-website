import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EVENT } from '../../shared/layout';
import { api } from '../lib/api';
import { rupee } from '../lib/format';
import { useStadium } from '../store/useStadium';

const HINTS = ['Move over the stadium and click a stand', 'Now pick a block', 'Pick a white seat. Red seats are booked.', 'This is your view. Drag to look around.'];

export function TopBar() {
  const night = useStadium(s => s.night);
  const setNight = useStadium(s => s.setNight);
  const { data } = useQuery({ queryKey: ['bookings'], queryFn: api.myBookings });
  const n = data?.length ?? 0;
  return (
    <header className="topbar">
      <div className="brand glass">
        <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="7" width="36" height="26" rx="12" fill="none" stroke="#f0f1ec" strokeWidth="2.4" /><rect x="11" y="13.5" width="18" height="13" rx="1.5" fill="#ff7a1a" /><line x1="20" y1="13.5" x2="20" y2="26.5" stroke="#1d0d02" strokeWidth="1.4" /></svg>
        <div style={{ minWidth: 0 }}>
          <div className="name">{EVENT.venue}</div>
          <div className="event"><b>{EVENT.competition}</b> · {EVENT.home} vs {EVENT.away} · {EVENT.dateLabel}</div>
        </div>
      </div>
      <div className="tools">
        <div className="seg glass" role="group" aria-label="Lighting">
          <button aria-pressed={!night} onClick={() => setNight(false)}>Day</button>
          <button aria-pressed={night} onClick={() => setNight(true)}>Night</button>
        </div>
        <div className={'tickets glass' + (n ? ' has' : '')}><i className="dot" /><span className="n">{n}</span><span className="lbl">{n === 1 ? 'ticket' : 'tickets'}</span></div>
      </div>
    </header>
  );
}

export function Hint() {
  const mode = useStadium(s => s.mode);
  const flash = useStadium(s => s.flash);
  return <div className={'hint glass' + (flash ? ' flash' : '')} key={flash ?? 'hint'}>{flash ?? HINTS[mode]}</div>;
}

export function Tip() {
  const tip = useStadium(s => s.tip);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth || 220, h = ref.current.offsetHeight || 70;
    let x = tip.x + 18, y = tip.y + 18;
    if (x + w > innerWidth - 12) x = tip.x - w - 18;
    if (y + h > innerHeight - 12) y = tip.y - h - 18;
    setPos({ x, y });
  }, [tip]);
  return (
    <div ref={ref} className={'tip' + (tip ? ' on' : '')} aria-hidden="true" style={{ transform: `translate(${pos.x}px,${pos.y}px)` }}>
      {tip && (
        <>
          <div className="te">{tip.eyebrow}</div>
          <div><div className="tt">{tip.title}</div><div className={'ts' + (tip.warn ? ' taken' : '')}><i />{tip.sub}</div></div>
          <div className="tp"><small>{tip.priceLabel}</small>{tip.price}</div>
        </>
      )}
    </div>
  );
}

export function TicketModal() {
  const booking = useStadium(s => s.booking);
  const engine = useStadium(s => s.engine);
  const bars = useMemo(() => Array.from({ length: 24 }, () => 1 + Math.floor(Math.random() * 3)), [booking?.ref]);
  if (!booking) return null;
  const close = () => useStadium.setState({ booking: null });
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="ticket" role="dialog" aria-modal="true" aria-labelledby="tMatch">
        <div className="tmain">
          <div className="tbar"><span>{EVENT.competition}</span><span className="ok"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Confirmed</span></div>
          <div className="tmatch" id="tMatch">{EVENT.home} <em>vs</em> {EVENT.away}</div>
          <div className="tdate">{EVENT.longDate} · {EVENT.venue}</div>
          <dl className="tgrid">
            <div><dt>Gate</dt><dd>{booking.gate}</dd></div>
            <div><dt>Block</dt><dd>{booking.block}</dd></div>
            <div><dt>Row</dt><dd>{booking.row}</dd></div>
            <div><dt>Seat</dt><dd>{booking.seat}</dd></div>
            <div><dt>Tier</dt><dd>{booking.tier.replace(' Tier', '')}</dd></div>
          </dl>
          <div className="tfoot"><div className="ref">Booking reference<b>{booking.ref}</b>{booking.stand}</div><div className="paid">{rupee(booking.total)}</div></div>
        </div>
        <div className="tstub"><div className="admit">Admit one</div><div className="barcode" aria-hidden="true">{bars.map((w, i) => <i key={i} style={{ width: w }} />)}</div></div>
        <div className="tactions">
          <button className="btn primary" autoFocus onClick={() => { close(); engine?.goOverview(); }}>Book another seat</button>
          <button className="btn" onClick={close}>Back to my view</button>
        </div>
      </div>
    </div>
  );
}

export function Loader() {
  const ready = useStadium(s => s.ready);
  const { label, fraction } = useStadium(s => s.progress);
  const pct = Math.round(fraction * 100);
  return (
    <div className={'cover' + (ready ? ' out' : '')}>
      <div className="ld">
        <div className="eyebrow">{EVENT.venue} · {EVENT.competition}</div>
        <h1>Choose your seat</h1>
        <p>{label}</p>
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
        <div className="pct">{pct}%</div>
      </div>
    </div>
  );
}

export function RotatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth);
  useLayoutEffect(() => {
    const on = () => setPortrait(innerHeight > innerWidth);
    addEventListener('resize', on); return () => removeEventListener('resize', on);
  }, []);
  const coarse = useMemo(() => matchMedia('(pointer: coarse)').matches, []);
  if (dismissed || !coarse || !portrait) return null;
  return (
    <div className="cover rotate">
      <div>
        <div className="phone" aria-hidden="true" />
        <h2>Turn your phone</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>The stadium is best seen in landscape.</p>
        <button className="btn" onClick={() => setDismissed(true)}>Continue in portrait</button>
      </div>
    </div>
  );
}
