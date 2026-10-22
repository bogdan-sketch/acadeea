package com.horae.app.ui.transfers

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import com.horae.app.data.remote.dto.TransferAvizDto
import com.horae.app.data.remote.dto.TransferConformityDto
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.qtyFormatted
import java.util.Locale

// Printable transfer documents — faithful to the paper models and to iOS
// (avizHTML / conformityHTML). Payload → HTML → Android print framework.

private fun esc(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;")

private fun unitAbbr(unit: String): String =
    runCatching { UnitType.valueOf(unit).abbreviation }.getOrDefault(unit.lowercase())

/** "1.250,50" — Romanian comma, two decimals (the column header carries "lei"). */
private fun money(v: Double?): String = v?.let { com.horae.app.ui.common.RoFormat.number(it, 2, minFractionDigits = 2) } ?: "&nbsp;"

/** dd.MM.yyyy of the instant's day in Europe/Bucharest (date-only values keep their day). */
private fun ddmmyyyy(iso: String): String =
    com.horae.app.ui.common.RoDate.calendarDay(iso)?.let(com.horae.app.ui.common.RoDate::numericDate)
        ?: iso.take(10).split("-").reversed().joinToString(".")

private fun htmlDocument(title: String, body: String): String = """
    <!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Helvetica, sans-serif; font-size: 12px; color: #000; margin: 24px; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; }
    .meta { margin: 2px 0; }
    .row { display: flex; justify-content: space-between; }
    .sig { margin-top: 36px; display: flex; justify-content: space-between; }
    </style></head><body>
    $body
    </body></html>
""".trimIndent()

fun avizHtml(a: TransferAvizDto): String {
    fun party(label: String, p: com.horae.app.data.remote.dto.AvizPartyDto?): String {
        val name = p?.name.orEmpty()
        val loc = p?.locationName.orEmpty()
        val addr = p?.address ?: "______________________"
        val cui = p?.cui ?: "______________"
        return """
            <td style="width:50%"><b>$label</b><br>
            Denumire: ${esc(name)}<br>
            Punct de lucru: ${esc(loc)}<br>
            Adresa: ${esc(addr)}<br>
            CUI: ${esc(cui)}</td>
        """.trimIndent()
    }

    var totalKnown = 0.0
    var hasAnyPrice = false
    val rows = a.items.mapIndexed { i, item ->
        val value: String
        val unitPriceDisplay: Double?
        if (item.unitPrice != null) {
            hasAnyPrice = true
            val v = item.unitPrice * item.quantity
            totalKnown += v
            value = money(v)
            unitPriceDisplay = if (item.quantity != 0.0) v / item.quantity else item.unitPrice
        } else {
            value = "&nbsp;"
            unitPriceDisplay = null
        }
        "<tr><td>${i + 1}</td><td>${esc(item.name)}</td><td>${item.quantity.qtyFormatted()}</td>" +
            "<td>${unitAbbr(item.unit)}</td><td>${money(unitPriceDisplay)}</td><td>$value</td></tr>"
    }.joinToString("")

    val total = if (hasAnyPrice) money(totalKnown) else "&nbsp;"
    val body = """
        <h1>AVIZ DE ÎNSOȚIRE A MĂRFII</h1>
        <p class="meta" style="text-align:center">(bon de transfer între gestiuni)</p>
        <div class="row"><span class="meta"><b>Seria și nr.:</b> ${esc(a.serial)}</span>
        <span class="meta"><b>Data emiterii:</b> ${ddmmyyyy(a.issuedAt)}</span></div>
        <table><tr>${party("FURNIZOR", a.supplier)}${party("CUMPĂRĂTOR", a.buyer)}</tr></table>
        <table>
          <tr><th>Nr. crt</th><th>Denumirea bunurilor</th><th>Cantitate</th><th>U.M.</th><th>Preț unitar (lei)</th><th>Valoare (lei)</th></tr>
          $rows
          <tr><td colspan="5" style="text-align:right"><b>TOTAL</b></td><td>$total</td></tr>
        </table>
        <p class="meta"><b>Date privind expediția:</b></p>
        <p class="meta">Numele delegatului: ${esc(a.delegateName ?: "______________________")}</p>
        <p class="meta">Destinatar (primește marfa): ${esc(a.recipientName ?: "______________________")}</p>
        <p class="meta">Seria și nr. CI/buletin: ______________________</p>
        <p class="meta">Mijloc de transport: ______________________ &nbsp;&nbsp; Ora efectuării expediției: __________</p>
        <div class="sig"><span>Data primirii în gestiune: ______________</span>
        <span>Semnătura gestionarului primitor: ______________</span></div>
    """.trimIndent()
    return htmlDocument("Aviz de insotire a marfii", body)
}

fun conformityHtml(c: TransferConformityDto): String {
    val org = c.organization
    val issued = ddmmyyyy(c.issuedAt)
    val delivery = ddmmyyyy(c.deliveryDate)
    val head = buildString {
        append("<p class=\"meta\"><b>${esc(org?.name.orEmpty())}</b></p>")
        org?.legalAddress?.let { append("<p class=\"meta\">${esc(it)}</p>") }
        org?.contactPhone?.let { append("<p class=\"meta\">Tel. ${esc(it)}</p>") }
        org?.contactEmail?.let { append("<p class=\"meta\">${esc(it)}</p>") }
        org?.website?.let { append("<p class=\"meta\">${esc(it)}</p>") }
        org?.cui?.let { append("<p class=\"meta\">CUI: ${esc(it)}</p>") }
        org?.regCom?.let { append("<p class=\"meta\">REG COM. ${esc(it)}</p>") }
    }
    val items = c.items.joinToString("") {
        "<li>${esc(it.name)} — ${it.quantity.qtyFormatted()} ${unitAbbr(it.unit)}</li>"
    }
    val body = """
        $head
        <h1 style="margin-top:24px">DECLARAȚIE DE CONFORMITATE</h1>
        <p class="meta" style="text-align:center">NR. ${esc(c.serial)} DIN DATA $issued</p>
        <p style="text-align:justify;line-height:1.6;margin-top:16px">
        Prin prezenta declarație de conformitate noi ${esc(org?.name.orEmpty())}, declarăm pe proprie răspundere
        că produsele livrate către <b>${esc(c.deliveredTo)}</b> în data de <b>$delivery</b>, nu pun
        în pericol viața, sănătatea, siguranța alimentară, securitatea muncii și protecția mediului
        și sunt în conformitate cu legislația sanitară, sanitar-veterinară și pentru siguranța
        alimentelor în vigoare, întrunind toate condițiile și normele legale de producere,
        comercializare și consum, cu respectarea R852/2004/CE, R853/2004/CE, R 2073/2005/CE și
        expiră după caz: 8 ore după livrare la maxim 20°C, respectiv 48 de ore la temperaturi de 4°C.
        </p>
        <p style="text-align:justify;line-height:1.6">
        Garantăm calitatea produselor pe timpul termenului de valabilitate cu condiția respectării
        condițiilor de depozitare. Nu ne asumăm nicio responsabilitate în cazul depozitării în
        condiții neconforme.
        </p>
        <p class="meta"><b>Produse livrate:</b></p>
        <ul>$items</ul>
        <div class="sig" style="margin-top:48px">
          <span><b>Administrator: ${esc(org?.administratorName ?: "____________________")}</b></span>
          <span>Semnătura ____________________</span>
        </div>
    """.trimIndent()
    return htmlDocument("Declaratie de conformitate", body)
}

// Strong references to in-flight print WebViews — Android may GC a WebView
// before its async onPageFinished fires (the print job then never starts) and
// the print framework needs it alive until the job completes. Application
// context + explicit release avoid leaking the Activity.
private val activePrintWebViews = mutableSetOf<WebView>()

/**
 * Render HTML to Android's print framework (PDF / physical printer / Save as PDF).
 * The WebView is retained until the print job finishes, then released.
 */
fun printHtmlDocument(context: Context, jobName: String, html: String) {
    val webView = WebView(context.applicationContext)
    activePrintWebViews += webView
    webView.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {
            val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val base = view.createPrintDocumentAdapter(jobName)
            // Wrap so we drop the WebView reference once the framework is done with it.
            val adapter = object : android.print.PrintDocumentAdapter() {
                override fun onStart() = base.onStart()
                override fun onLayout(
                    oldAttributes: PrintAttributes?,
                    newAttributes: PrintAttributes?,
                    cancellationSignal: android.os.CancellationSignal?,
                    callback: LayoutResultCallback?,
                    extras: android.os.Bundle?,
                ) = base.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras)
                override fun onWrite(
                    pages: Array<out android.print.PageRange>?,
                    destination: android.os.ParcelFileDescriptor?,
                    cancellationSignal: android.os.CancellationSignal?,
                    callback: WriteResultCallback?,
                ) = base.onWrite(pages, destination, cancellationSignal, callback)
                override fun onFinish() {
                    base.onFinish()
                    activePrintWebViews -= webView
                    webView.destroy()
                }
            }
            printManager.print(
                jobName,
                adapter,
                PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .build(),
            )
        }
    }
    webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
}
