// SPDX-License-Identifier: GPL-3.0-only
// The classic bars: one span per recent level, tallest where the voice
// was loudest. Shared by the overlay and the waveform tiles in settings
// (US-084), so a tile is the pill's own drawing.

export const BAR_COUNT = 21

export function Bars(props: { levels: readonly number[]; compact?: boolean }): React.JSX.Element {
  const base = props.compact ? 4 : 6
  const span = props.compact ? 20 : 30
  return (
    <>
      {props.levels.map((level, i) => (
        <span key={i} className="bar" style={{ height: `${Math.round(base + level * span)}px` }} />
      ))}
    </>
  )
}
