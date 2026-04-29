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
}

const PrintLabelsView = ({ lines, rows, widthMm, heightMm }: Props) => {
  const expanded: LabelProduct[] = [];
  for (const l of lines) {
    for (let i = 0; i < l.copies; i++) {
      expanded.push(l);
    }
  }

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          .print-labels, .print-labels * {
            visibility: visible;
          }
          .print-labels {
            position: absolute;
            left: 0;
            top: 0;
          }
          .print-label {
            page-break-after: always;
            break-after: page;
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            overflow: hidden;
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
            />
          </div>
        ))}
      </div>
    </>
  );
};

export default PrintLabelsView;
