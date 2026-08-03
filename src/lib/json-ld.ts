/**
 * Serialize structured data for an inline script without allowing externally
 * sourced text to terminate the script element. JSON itself permits `<`, but
 * HTML parsers still recognize `</script>` inside application/ld+json.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
