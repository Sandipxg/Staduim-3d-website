import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STANDS, TIERS, EVENT, bookingFee } from '../../shared/layout';
import type { SeatsResponse } from '../../shared/api';
import { api, ApiError } from '../lib/api';
import { layout, SEAT_COUNT } from '../lib/layout';
import { count, rupee } from '../lib/format';
import { freeIn, standFrom, useStadium } from '../store/useStadium';

const STEP_NAMES = ['Stand', 'Block', 'Seat'];

function Steps() {
  const mode = useStadium(s => s.mode);
  const back = () => useStadium.getState().engine?.back();
  const at = mode === 0 ? 0 : mode === 1 ? 1 : 2;
  return (
    <div className="ph">
      <button className="back" aria-label="Back" hidden={mode === 0} onClick={back}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="steps">
        {STEP_NAMES.map((n, i) => {
          const st = i < at ? 'done' : i === at ? 'on' : '';
          return (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && <span className="sep" />}
              <span className={st}><i>{st === 'done' ? '✓' : i + 1}</i>{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function OverviewPanel() {
  const statuses = useStadium(s => s.statuses);
  const engine = useStadium(s => s.engine);
  const busy = useStadium(s => s.busy);
  const totalFree = freeIn(statuses, layout.seats.map(s => s.id));
  return (
    <>
      <div className="eyebrow">Sat 12 Dec · Kick-off 19:30</div>
      <h2>Pick a stand</h2>
      <p className="lede">{count(totalFree)} of {count(SEAT_COUNT)} seats still open. Hover the bowl or choose from the list.</p>
      <ul className="list">
        {STANDS.map((st, k) => {
          const f = freeIn(statuses, layout.standSeats[k]), pct = Math.round(f / layout.standSeats[k].length * 100);
          return (
            <li key={st.name}>
              <button className="srow" onMouseEnter={() => engine?.previewStand(k)} onMouseLeave={() => engine?.previewStand(-1)} onClick={() => !busy && engine?.goStand(k)}>
                <span className="gate" aria-label={`Gate ${st.gate}`}>{st.gate}</span>
                <span className="rmain">
                  <b>{st.name}</b>
                  <small>Gate {st.gate} · {count(f)} left</small>
                  <i className={'meter' + (pct < 25 ? ' low' : '')}><i style={{ width: pct + '%' }} /></i>
                </span>
                <span className="rprice"><small>from</small>{rupee(standFrom(k))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function StandPanel({ k }: { k: number }) {
  const statuses = useStadium(s => s.statuses);
  const engine = useStadium(s => s.engine);
  const busy = useStadium(s => s.busy);
  const st = STANDS[k], ids = layout.standBlocks[k];
  return (
    <>
      <div className="eyebrow">Gate {st.gate} · {st.tag}</div>
      <h2>{st.name}</h2>
      <p className="lede">{count(freeIn(statuses, layout.standSeats[k]))} seats open across {ids.length} blocks. Middle tier has the best sightlines.</p>
      {TIERS.map((tr, t) => {
        const tierIds = ids.filter(id => layout.blocks[id].tier === t);
        return (
          <div className="tier" key={tr.name}>
            <div className="tier-h"><h3>{tr.name}</h3><span>{rupee(layout.blocks[tierIds[0]].price)}</span></div>
            <div className="chips">
              {tierIds.map(id => {
                const b = layout.blocks[id], f = freeIn(statuses, b.seats);
                return (
                  <button key={id} className={'chip' + (f === 0 ? ' sold' : '')}
                    onMouseEnter={() => engine?.previewBlock(id)} onMouseLeave={() => engine?.previewBlock(-1)}
                    onClick={() => !busy && f > 0 && engine?.goBlock(id)}>
                    <b>Block {b.label}</b><small>{f ? `${f} left` : 'Sold out'}</small>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function BlockPanel({ id }: { id: number }) {
  const statuses = useStadium(s => s.statuses);
  const engine = useStadium(s => s.engine);
  const hasYours = statuses.includes(2);
  const b = layout.blocks[id], st = STANDS[b.stand], f = freeIn(statuses, b.seats);
  return (
    <>
      <div className="eyebrow">{TIERS[b.tier].name} · {st.name}</div>
      <h2>Block {b.label}</h2>
      <div className="bigprice">
        <div className="v">{rupee(b.price)}<small>/ seat</small></div>
        <div className="left"><b>{f}</b>of {b.seats.length} left</div>
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--free)' }} />Open</span>
        <span><i style={{ background: 'var(--taken)' }} />Booked</span>
        <span><i style={{ background: 'var(--hi)' }} />Hover</span>
        {hasYours && <span><i style={{ background: 'var(--yours)' }} />Yours</span>}
      </div>
      <p className="lede" style={{ margin: 0 }}>Click any white seat to fly to it and see its view of the pitch.</p>
      <div className="btns">
        <button className="btn primary" disabled={!f} onClick={() => { const i = engine?.bestSeat(id) ?? -1; if (i >= 0) engine?.goSeat(i); }}>Pick best available</button>
      </div>
    </>
  );
}

function SeatPanel({ i }: { i: number }) {
  const statuses = useStadium(s => s.statuses);
  const engine = useStadium(s => s.engine);
  const qc = useQueryClient();
  const s = layout.seats[i], b = layout.blocks[s.block], st = STANDS[s.stand], fee = bookingFee(b.price), mine = statuses[i] === 2;

  const book = useMutation({
    mutationFn: () => api.book(i),
    onSuccess: booking => {
      qc.setQueryData<SeatsResponse>(['seats'], prev => prev && { ...prev, statuses: prev.statuses.slice(0, i) + '2' + prev.statuses.slice(i + 1) });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      useStadium.setState({ booking });
    },
    onError: err => {
      useStadium.getState().flashHint(err instanceof ApiError ? err.message : 'Booking failed. Check your connection and try again.');
      if (err instanceof ApiError && err.status === 409) { qc.invalidateQueries({ queryKey: ['seats'] }); engine?.goBlock(s.block); }
    },
  });

  return (
    <>
      {mine && <div className="booked"><i />Booked. This seat is yours.</div>}
      <div className="eyebrow">Your view from</div>
      <h2>Row {s.row} · Seat {s.num}</h2>
      <p className="lede">{st.name}, {TIERS[b.tier].name.toLowerCase()}. Drag the view to look around.</p>
      <dl className="facts">
        <div><dt>Gate</dt><dd>{st.gate}</dd></div>
        <div><dt>Block</dt><dd>{b.label}</dd></div>
        <div><dt>Row</dt><dd>{s.row}</dd></div>
        <div><dt>Seat</dt><dd>{s.num}</dd></div>
        <div><dt>Tier</dt><dd>{['L', 'M', 'U'][b.tier]}</dd></div>
      </dl>
      <div className="sum">
        <div><span>Ticket</span><span>{rupee(b.price)}</span></div>
        <div><span>Booking fee</span><span>{rupee(fee)}</span></div>
        <div className="tot"><span>Total</span><span>{rupee(b.price + fee)}</span></div>
      </div>
      <div className="btns">
        {!mine && <button className="btn primary" disabled={book.isPending} onClick={() => book.mutate()}>{book.isPending ? 'Booking…' : 'Confirm ticket'}</button>}
        <button className="btn" onClick={() => engine?.goBlock(s.block)}>Choose another seat</button>
      </div>
      <p className="note">{EVENT.competition} · {EVENT.dateLabel}</p>
    </>
  );
}

export function Panel() {
  const { mode, stand, block, seat, busy } = useStadium();
  return (
    <aside className={'panel glass' + (busy ? ' busy' : '')} aria-live="polite">
      <Steps />
      {mode === 0 && <OverviewPanel />}
      {mode === 1 && stand >= 0 && <StandPanel k={stand} />}
      {mode === 2 && block >= 0 && <BlockPanel id={block} />}
      {mode === 3 && seat >= 0 && <SeatPanel key={seat} i={seat} />}
    </aside>
  );
}
