import { useEffect, useState, type RefObject } from 'react';

interface TablePickerProps { onInsert: (rows: number, columns: number) => void; anchorRef: RefObject<HTMLButtonElement>; }

export function TablePicker({ onInsert, anchorRef }: TablePickerProps) {
  const [size, setSize] = useState({ rows: 0, columns: 0 });
  const [dragging, setDragging] = useState(false);
  const maxRows = 8;
  const maxColumns = 10;
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 6, left: rect.left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const stop = () => setDragging(false);
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  const handleCellClick = () => {
    if (size.rows > 0 && size.columns > 0) onInsert(size.rows, size.columns);
  };

  return <div className="table-picker-popover" style={{ top: position.top, left: position.left }} onClick={(event) => event.stopPropagation()}>
    <div className="table-picker">
      <div className="table-picker-header"><strong>插入表格</strong><span>{size.rows} × {size.columns}</span></div>
      <div className="table-picker-grid" onMouseLeave={() => !dragging && setSize({ rows: 0, columns: 0 })}>
        {Array.from({ length: maxRows * maxColumns }, (_, index) => {
          const row = Math.floor(index / maxColumns) + 1;
          const column = (index % maxColumns) + 1;
          const active = row <= size.rows && column <= size.columns;
          return <button key={index} aria-label={`${row}行${column}列`} className={active ? 'active' : ''} onMouseDown={(event) => { event.preventDefault(); setDragging(true); setSize({ rows: row, columns: column }); }} onMouseEnter={() => setSize({ rows: row, columns: column })} onClick={handleCellClick} />;
        })}
      </div>
      <div className="table-picker-hint">拖动选择表格大小，松开鼠标插入</div>
    </div>
  </div>;
}
