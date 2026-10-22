import { Injectable, NotFoundException } from '@nestjs/common';
import { UnitType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import PDFDocument from 'pdfkit';

import { PrismaService } from '@/prisma/prisma.service';
import { currentOrgWhere } from '@/prisma/tenant-context';

const UNIT_LABELS: Record<UnitType, string> = {
  MILIGRAME: 'mg',
  GRAME: 'g',
  KILOGRAME: 'kg',
  MILILITRI: 'ml',
  LITRI: 'l',
  BUCATI: 'buc',
  LINGURITE: 'lgt',
  LINGURI: 'lg',
  CANI: 'cani',
  OUNCES: 'oz',
  POUNDS: 'lb',
};

const DECLARATION_TEXT =
  'Prin prezentul certificat se atesta ca produsele mentionate mai sus au fost ' +
  'fabricate in conformitate cu retetele si specificatiile tehnice ale producatorului, ' +
  'respecta normele igienico-sanitare in vigoare si sunt conforme pentru consum.';

/** Generates the conformity certificate PDF for an order. */
@Injectable()
export class CertificatePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateConformityCertificatePdf(
    orderId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { recipe: { select: { name: true } } } },
        deliveryNote: {
          include: {
            conformityCertificate: {
              include: { issuedBy: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const cert = order.deliveryNote?.conformityCertificate;
    if (!cert) throw new NotFoundException('Conformity certificate not found');

    const organization = await this.prisma.organization.findFirst({
      where: currentOrgWhere(),
      orderBy: { createdAt: 'asc' },
    });
    const orgName = organization?.name ?? 'Acadeea';
    const accentColor = organization?.accentColor ?? '#D4527B';

    const buffer = await this.renderPdf({
      orgName,
      accentColor,
      serialNumber: cert.serialNumber,
      issuedAt: cert.createdAt,
      issuedByName: `${cert.issuedBy.firstName} ${cert.issuedBy.lastName}`,
      notes: cert.notes,
      orderNumber: order.orderNumber,
      deliveryNoteSerial: order.deliveryNote?.serialNumber ?? null,
      deliveryPoint: order.deliveryPoint,
      deliveryAddress: order.deliveryAddress,
      items: order.items.map((item) => ({
        // Unmapped external products have no recipe — fall back to their label.
        name: item.recipe?.name ?? item.label ?? '',
        quantity:
          item.quantity instanceof Decimal ? item.quantity.toNumber() : Number(item.quantity),
        unit: UNIT_LABELS[item.unit],
      })),
    });

    return { buffer, fileName: `${cert.serialNumber}.pdf` };
  }

  private renderPdf(data: {
    orgName: string;
    accentColor: string;
    serialNumber: string;
    issuedAt: Date;
    issuedByName: string;
    notes: string | null;
    orderNumber: string;
    deliveryNoteSerial: string | null;
    deliveryPoint: string;
    deliveryAddress: string | null;
    items: { name: string; quantity: number; unit: string }[];
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100; // content width inside margins
      const formatDate = (date: Date) =>
        `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1)
          .toString()
          .padStart(2, '0')}.${date.getFullYear()}`;

      // Header
      doc
        .fillColor(data.accentColor)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(data.orgName, 50, 50);
      doc
        .moveTo(50, 80)
        .lineTo(doc.page.width - 50, 80)
        .lineWidth(2)
        .strokeColor(data.accentColor)
        .stroke();

      // Title
      doc
        .moveDown(2)
        .fillColor('#000000')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('CERTIFICAT DE CONFORMITATE', { align: 'center' });
      doc
        .moveDown(0.3)
        .fontSize(11)
        .font('Helvetica')
        .text(`Seria: ${data.serialNumber}`, { align: 'center' })
        .text(`Data emiterii: ${formatDate(data.issuedAt)}`, { align: 'center' });

      // Order info
      doc.moveDown(1.5);
      const infoLine = (label: string, value: string) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      };
      infoLine('Emitent', data.orgName);
      infoLine('Comanda', data.orderNumber);
      if (data.deliveryNoteSerial) infoLine('Foaie de parcurs', data.deliveryNoteSerial);
      infoLine('Punct livrare', data.deliveryPoint);
      if (data.deliveryAddress) infoLine('Adresa livrare', data.deliveryAddress);

      // Items table
      doc.moveDown(1.5);
      doc.fontSize(12).font('Helvetica-Bold').text('Produse livrate');
      doc.moveDown(0.5);

      const colNr = 50;
      const colName = 90;
      const colQty = 420;
      const colUnit = 490;
      let y = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Nr.', colNr, y);
      doc.text('Produs', colName, y);
      doc.text('Cantitate', colQty, y, { width: 60, align: 'right' });
      doc.text('UM', colUnit, y);
      y += 16;
      doc
        .moveTo(50, y - 4)
        .lineTo(doc.page.width - 50, y - 4)
        .lineWidth(0.5)
        .strokeColor('#999999')
        .stroke();

      doc.font('Helvetica').fontSize(10);
      data.items.forEach((item, index) => {
        if (y > doc.page.height - 180) {
          doc.addPage();
          y = 50;
        }
        doc.text(`${index + 1}`, colNr, y);
        doc.text(item.name, colName, y, { width: colQty - colName - 10 });
        doc.text(item.quantity.toFixed(1), colQty, y, { width: 60, align: 'right' });
        doc.text(item.unit, colUnit, y);
        y += 18;
      });
      doc
        .moveTo(50, y - 4)
        .lineTo(doc.page.width - 50, y - 4)
        .lineWidth(0.5)
        .strokeColor('#999999')
        .stroke();

      // Declaration
      doc.y = y + 20;
      doc.x = 50;
      doc.fontSize(12).font('Helvetica-Bold').text('Declaratie de conformitate');
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(DECLARATION_TEXT, { width: pageWidth, align: 'justify' });

      if (data.notes) {
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica-Bold').text('Observatii');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').text(data.notes, { width: pageWidth });
      }

      // Footer: issuer + signature
      doc.moveDown(3);
      const footerY = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').text('Emis de:', 50, footerY);
      doc.font('Helvetica').text(data.issuedByName, 50, footerY + 14);
      doc.text(formatDate(data.issuedAt), 50, footerY + 28);

      doc.font('Helvetica-Bold').text('Semnatura si stampila:', 350, footerY);
      doc
        .moveTo(350, footerY + 50)
        .lineTo(530, footerY + 50)
        .lineWidth(0.5)
        .strokeColor('#000000')
        .stroke();

      doc.end();
    });
  }
}
