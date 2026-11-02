globalThis.MystyleRuntime = (() => {
      "use strict";

      const TOGGLE_SELECTOR =
        "details.proof-box[data-toggle-key], .reason-box[data-toggle-key]";

      const revisions = new WeakMap();
      const lockedStates = new WeakMap();

      let queue = Promise.resolve();
      let printState = null;

      const mathReady = new Promise((resolve) => {
        const loader = document.getElementById("mathjax-loader");
        let settled = false;

        const timer = window.setTimeout(() => finish(null), 20000);

        function finish(value) {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timer);
          resolve(value);
        }

        async function loaded() {
          try {
            const mathJax = window.MathJax;

            if (mathJax?.startup?.promise) {
              await mathJax.startup.promise;
            }

            finish(mathJax?.typesetPromise ? mathJax : null);
          } catch {
            finish(null);
          }
        }

        if (window.MathJax?.startup?.promise) {
          loaded();
        } else if (loader) {
          loader.addEventListener("load", loaded, {
            once: true
          });

          loader.addEventListener("error", () => finish(null), {
            once: true
          });
        } else {
          finish(null);
        }
      });

      function schedule(task) {
        const pending = queue
          .catch(() => undefined)
          .then(() => mathReady)
          .then(async (initialMathJax) => {
            const mathJax = window.MathJax?.typesetPromise
              ? window.MathJax
              : initialMathJax;

            if (mathJax?.startup?.promise) {
              await mathJax.startup.promise;
            }

            return task(mathJax);
          });

        queue = pending;
        return pending;
      }

      function toggleElements(root) {
        return Array.from(root.querySelectorAll(TOGGLE_SELECTOR));
      }

      function isExpanded(element) {
        return element.matches("details.proof-box")
          ? element.open
          : !element.classList.contains("is-collapsed");
      }

      function setReasonExpanded(box, expanded) {
        const button = box.querySelector(
          ":scope > .reason-inner > .reason-prefix > .reason-toggle"
        );

        const content = box.querySelector(
          ":scope > .reason-inner > .reason-text"
        );

        box.classList.toggle("is-collapsed", !expanded);

        if (content) {
          content.hidden = !expanded;
        }

        if (button) {
          button.setAttribute("aria-expanded", String(expanded));
          button.setAttribute(
            "aria-label",
            expanded ? "理由を折り畳む" : "理由を展開"
          );
        }
      }

      function setExpanded(element, expanded) {
        if (element.matches("details.proof-box")) {
          element.open = expanded;
        } else {
          setReasonExpanded(element, expanded);
        }
      }

      function snapshot(root) {
        if (lockedStates.has(root)) {
          return new Map(lockedStates.get(root));
        }

        return new Map(
          toggleElements(root).map((element) => [
            element.dataset.toggleKey,
            isExpanded(element)
          ])
        );
      }

      function restore(root, states) {
        for (const element of toggleElements(root)) {
          const key = element.dataset.toggleKey;

          setExpanded(
            element,
            states.has(key) ? states.get(key) : true
          );
        }
      }

      function expandAll(root) {
        for (const element of toggleElements(root)) {
          setExpanded(element, true);
        }
      }

      async function typesetOpen(root, mathJax, previousStates) {
        const desiredStates = new Map(
          toggleElements(root).map((element) => {
            const key = element.dataset.toggleKey;

            return [
              key,
              previousStates.has(key) ? previousStates.get(key) : true
            ];
          })
        );

        const oldVisibility = root.style.visibility;
        const oldBusy = root.getAttribute("aria-busy");
        const wasInert = root.hasAttribute("inert");

        lockedStates.set(root, desiredStates);

        root.style.visibility = "hidden";
        root.setAttribute("aria-busy", "true");
        root.setAttribute("inert", "");

        expandAll(root);

        try {
          mathJax.texReset();
          await mathJax.typesetPromise([root]);
        } finally {
          restore(root, desiredStates);
          lockedStates.delete(root);

          root.style.visibility = oldVisibility;

          if (oldBusy === null) {
            root.removeAttribute("aria-busy");
          } else {
            root.setAttribute("aria-busy", oldBusy);
          }

          if (!wasInert) {
            root.removeAttribute("inert");
          }
        }
      }

      function render(root, html) {
        const revision = (revisions.get(root) || 0) + 1;
        revisions.set(root, revision);

        if (!window.MathJax?.typesetPromise) {
          const states = snapshot(root);
          root.innerHTML = html;
          restore(root, states);
        }

        return schedule(async (mathJax) => {
          if (revisions.get(root) !== revision) {
            return Boolean(mathJax);
          }

          const states = snapshot(root);

          if (mathJax) {
            mathJax.typesetClear([root]);
          }

          root.innerHTML = html;

          if (!mathJax) {
            restore(root, states);
            return false;
          }

          await typesetOpen(root, mathJax, states);
          return true;
        });
      }

      function typeset(root) {
        return schedule(async (mathJax) => {
          if (!root || !mathJax) {
            return false;
          }

          await typesetOpen(root, mathJax, snapshot(root));
          return true;
        });
      }

      function revealTarget(target) {
        for (
          let element = target;
          element;
          element = element.parentElement
        ) {
          if (element.matches("details")) {
            element.open = true;
          }

          if (element.matches(".reason-box")) {
            setReasonExpanded(element, true);
          }
        }
      }

      function targetFromHash(hash) {
        try {
          const id = decodeURIComponent(hash.replace(/^#/, ""));
          return id ? document.getElementById(id) : null;
        } catch {
          return null;
        }
      }

      function revealHash() {
        const target = targetFromHash(window.location.hash);

        if (target) {
          revealTarget(target);
          requestAnimationFrame(() => target.scrollIntoView());
        }
      }

      document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const button = event.target.closest(".reason-toggle");

        if (button) {
          const box = button.closest(".reason-box");

          if (box) {
            setReasonExpanded(box, !isExpanded(box));
          }

          return;
        }

        const link = event.target.closest('a[href^="#"]');

        if (!link) {
          return;
        }

        const hash = link.getAttribute("href");
        const target = targetFromHash(hash);

        if (!target) {
          return;
        }

        event.preventDefault();
        revealTarget(target);

        try {
          history.replaceState(null, "", hash);
        } catch {
          // file:で履歴操作が制限されても移動は続行する。
        }

        requestAnimationFrame(() => target.scrollIntoView());
      });

      window.addEventListener("hashchange", revealHash);

      window.addEventListener("beforeprint", () => {
        if (printState) {
          return;
        }

        printState = Array.from(
          document.querySelectorAll(".paper"),
          (root) => ({
            root,
            states: snapshot(root)
          })
        );

        for (const { root } of printState) {
          expandAll(root);
        }
      });

      window.addEventListener("afterprint", () => {
        if (!printState) {
          return;
        }

        for (const { root, states } of printState) {
          if (root.isConnected) {
            restore(root, states);
          }
        }

        printState = null;
      });

      return {
        render,
        typeset,
        snapshot,
        restore,
        revealHash
      };
    })();
