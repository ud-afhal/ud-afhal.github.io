"use strict";
globalThis.MystyleRuntime
  .typeset(document.getElementById("public-document"))
  .then((available) => {
    if (!available) {
      console.warn("MathJaxを読み込めませんでした。");
    }
    globalThis.MystyleRuntime.revealHash();
  })
  .catch((error) => {
    console.error("数式の描画に失敗しました。", error);
  });
