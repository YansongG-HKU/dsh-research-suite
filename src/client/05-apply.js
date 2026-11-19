/**
 * dsh-research-suite — 05-apply
 *
 * Slot registration: sidebar entry plus the main panel. Locale is handled by the
 * panel itself (zh/en), so only slots and layout are injected.
 */

    return {
      inject: ["slots", "layout"],
      apply(ctx) {
        const openPanel = function () {
          try {
            ctx.layout.selectPanel(NS)
          } catch {
            /* headless composition */
          }
        }

        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: NS,
              order: 26,
              label: function () {
                return detectLang() === "en" ? "Research Suite" : "科研套件"
              },
            },
            function (slotProps) {
              const size = slotProps && typeof slotProps.size === "number" ? slotProps.size : 20
              return h(Mark, { size: size })
            },
          )
        })

        ctx.slots.inject("main", function () {
          return ctx.slots.register(
            {
              name: "main",
              key: NS,
            },
            function (slotProps) {
              const props = slotProps || {}
              return h(ResearchSuitePanel, { t: typeof props.t === "function" ? props.t : undefined })
            },
          )
        })
      },

      /** Pure helpers for the headless bundle test; harmless at runtime. */
      __test__: {
        NS: NS,
        VERSION: VERSION,
        API_BASE: API_BASE,
        STAGES: STAGES,
        TEXT: TEXT,
        detectLang: detectLang,
        makeT: makeT,
        stageLabel: stageLabel,
        latestGates: latestGates,
        stageTone: stageTone,
        flywheelModel: flywheelModel,
        flywheelActionAvailability: flywheelActionAvailability,
        errorText: errorText,
        Portfolio: Portfolio,
        Flywheel: Flywheel,
        FlyAction: FlyAction,
        campaignPrompt: campaignPrompt,
        shortHash: shortHash,
        fmtNum: fmtNum,
      },
    }
  },
})
