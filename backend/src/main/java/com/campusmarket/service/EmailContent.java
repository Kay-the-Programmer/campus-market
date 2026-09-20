package com.campusmarket.service;

import org.springframework.web.util.HtmlUtils;

/**
 * Renders the one HTML shell every outgoing email shares.
 *
 * <p>Tables and inline styles, which looks like 2005 and is not a mistake:
 * Outlook's renderer ignores most of a stylesheet, several clients strip
 * {@code <style>} blocks outright, and flexbox is unavailable across enough of
 * the field to be unusable. A table with inline attributes is what renders the
 * same in an inbox as in a browser.
 *
 * <p>Bodies are authored as plain text and escaped on the way in, so an admin
 * cannot inject markup and no sanitiser is needed. Paragraph breaks are the
 * only formatting, which is the only formatting an announcement needs.
 */
final class EmailContent {

    private EmailContent() {
    }

    private static final String INK = "#0b1c30";
    private static final String MUTED = "#737686";
    private static final String ACCENT = "#2563eb";
    private static final String PAGE = "#f1f2f7";

    /**
     * @param preheader the line clients show beside the subject in the inbox
     *                  list. Left out, they helpfully substitute the first
     *                  text they find, which is usually the unsubscribe link.
     * @param footerHtml already-escaped trailing block (unsubscribe, or the
     *                   notification-settings line). Pass "" for none.
     */
    static String page(String title, String bodyText, String preheader,
                       String ctaLabel, String ctaUrl, String footerHtml) {
        String paragraphs = paragraphs(bodyText);
        String cta = (ctaLabel == null || ctaUrl == null || ctaUrl.isBlank()) ? "" : """
                <tr><td style="padding:8px 32px 8px 32px;">
                  <a href="%s" style="display:inline-block;background:%s;color:#ffffff;
                     text-decoration:none;font-weight:700;font-size:14px;
                     padding:12px 20px;border-radius:12px;">%s</a>
                </td></tr>
                """.formatted(attr(ctaUrl), ACCENT, esc(ctaLabel));

        return """
                <!doctype html>
                <html><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>%s</title></head>
                <body style="margin:0;padding:0;background:%s;">
                <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s</div>
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0"
                       style="background:%s;padding:24px 12px;">
                  <tr><td align="center">
                    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0"
                           style="max-width:560px;background:#ffffff;border-radius:16px;
                                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                  Roboto,Helvetica,Arial,sans-serif;">
                      <tr><td style="padding:28px 32px 4px 32px;">
                        <span style="font-size:17px;font-weight:800;color:%s;">CampusMarket</span>
                      </td></tr>
                      <tr><td style="padding:12px 32px 0 32px;">
                        <h1 style="margin:0 0 12px 0;font-size:19px;line-height:1.35;
                                   color:%s;font-weight:800;">%s</h1>
                      </td></tr>
                      <tr><td style="padding:0 32px;font-size:14px;line-height:1.6;color:%s;">
                        %s
                      </td></tr>
                      %s
                      <tr><td style="padding:24px 32px 28px 32px;font-size:11px;
                                     line-height:1.6;color:%s;border-top:1px solid #e9ebf5;">
                        %s
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
                </body></html>
                """.formatted(esc(title), PAGE, esc(preheader), PAGE, INK, INK, esc(title),
                "#434655", paragraphs, cta, MUTED, footerHtml);
    }

    /** Blank-line-separated text into paragraphs, everything escaped. */
    private static String paragraphs(String bodyText) {
        if (bodyText == null || bodyText.isBlank()) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (String block : bodyText.trim().split("\\R{2,}")) {
            String inner = esc(block.trim()).replaceAll("\\R", "<br>");
            out.append("<p style=\"margin:0 0 14px 0;\">").append(inner).append("</p>");
        }
        return out.toString();
    }

    /**
     * Plain-text alternative. Not a stripped version of the HTML - the HTML is
     * generated from this, so the text part is simply the original words plus
     * the links the markup would otherwise have hidden behind anchors.
     */
    static String text(String title, String bodyText, String ctaLabel, String ctaUrl,
                       String footerText) {
        StringBuilder out = new StringBuilder();
        out.append(title).append("\n\n").append(bodyText == null ? "" : bodyText.trim());
        if (ctaLabel != null && ctaUrl != null && !ctaUrl.isBlank()) {
            out.append("\n\n").append(ctaLabel).append(": ").append(ctaUrl);
        }
        if (footerText != null && !footerText.isBlank()) {
            out.append("\n\n---\n").append(footerText);
        }
        return out.append('\n').toString();
    }

    static String esc(String s) {
        return s == null ? "" : HtmlUtils.htmlEscape(s);
    }

    /**
     * URLs go in href, where htmlEscape is not enough on its own - a quote in
     * the value would close the attribute. Escaping covers it; this exists to
     * name the intent at the call site.
     */
    static String attr(String url) {
        return esc(url);
    }
}
