import { createPortal } from "react-dom";
import LabelPreview from "./LabelPreview";
import { LabelRow } from "./LabelTemplateEditor";
import { LabelProduct } from "@/pages/Labels";

interface PrintLine extends LabelProduct {
  copies: number;
}

interface Props {
  lines: PrintLine[];
  rows: LabelRow[];
  widthMm: number;
  heightMm: number;
  labelDate?: string;
}

const PrintLabelsView = ({ lines, rows, widthMm, heightMm, labelDate }: Props) => {
  const expanded: LabelProduct[] = [];
  for (const l of lines) {
    for (let i = 0; i < l.copies; i++) {
      expanded.push(l);
    }
  }

  return createPortal(
    <>
      <style>{`
        @media print {
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          body > * {
            display: none !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-labels {
            display: block !important;
            position: static;
            margin: 0;
            padding: 0;
          }
          .print-label {
            page-break-after: always;
            break-after: page;
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            overflow: hidden;
            margin: 0;
          }
          .print-label:last-child {
            page-break-after: auto;
          }
        }
        .print-labels {
          display: none;
        }
        @media print {
          .print-labels {
            display: block;
          }
        }
      `}</style>
      <div className="print-labels">
        {expanded.map((p, i) => (
          <div key={i} className="print-label">
            <LabelPreview
              product={p}
              rows={rows}
              widthMm={widthMm}
              heightMm={heightMm}
              scale={3.78}
              labelDate={labelDate}
            />
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
};

export default PrintLabelsView;