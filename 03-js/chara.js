(() => {

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(_){
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  }

  document.addEventListener("click", async (e) => {

    const link = e.target.closest(".copy-line a");
    if(!link) return;

    e.preventDefault();  // #のジャンプを止める

    const text = link.textContent.trim();
    if(!text) return;

    const ok = await copyText(text);

    const old = link.textContent;
    link.textContent = ok ? "コピー済" : "失敗";
    setTimeout(() => link.textContent = old, 700);

  });

})();
