(() => {
  const code =
    document.getElementById("codesdistxtnavfrm:codeParam")
      ?.textContent.trim();

  if (!code) throw Error("Code identifier not found");

  const records = [];

  document.querySelectorAll('a[href^="javascript:submitCodesValues("]')
    .forEach(a => {
      const args = [
        ...a.getAttribute("href").matchAll(/'([^']*)'/g)
      ].map(m => m[1]);

      if (args.length !== 6) return;

      const [section, path, year, chapter, billSection, uid] = args;

      const url = new URL(
        "/faces/codes_displaySection.xhtml",
        location.origin
      );

      url.searchParams.set("lawCode", code);
      url.searchParams.set("sectionNum", section);

      if (code === "CONS") {
        const article =
          document.getElementById("codesdistxtnavfrm:articleParam")
            ?.textContent.trim() || "";
        url.searchParams.set("article", article);
      }

      records.push({
        section, url: url.href,
        path, year, chapter, billSection, uid
      });

      a.href = url.href;
    });

  const text = records.map(r => r.url).join("\n");
  const blob = new Blob([text], {type: "text/plain"});
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${code}_SECTION_URLS.txt`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  console.table(records);
  console.log("Total URLs:", records.length);
})();
