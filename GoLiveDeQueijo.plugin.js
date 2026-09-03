/**
 * @name Go Live De Queijo Diagnostics
 * @author Pão de Queijo
 * @description Diagnóstico local para Gateway/RTC do Go Live De Queijo. Não envia dados para fora.
 * @version 1.0.0
 */

"use strict";

const fs = require("fs");
const path = require("path");

module.exports = class GoLiveDeQueijoDiagnostics {
    constructor() {
        this.api = new BdApi("GoLiveDeQueijoDiagnostics");
        this.mainApi = new BdApi("GoLiveBypassBD");

        this.settings = Object.assign({
            autoRecoverRtc: true,
            pollMs: 1000,
            maxUiLogLines: 140
        }, this.api.Data.load("settings") || {});

        this.timer = null;
        this.startedAt = 0;
        this.lastGatewayRouteId = null;
        this.lastGatewayAt = null;
        this.lastSnapshot = null;
        this.dispatcher = null;
    }

    get localAppData() {
        try {
            const value = window.DiscordNative?.process?.env?.LOCALAPPDATA;
            if (typeof value === "string" && value.trim()) return value;
        } catch {}

        try {
            return path.resolve(BdApi.Plugins.folder, "..", "..", "..", "Local");
        } catch {
            return null;
        }
    }

    get dataDir() {
        const base = this.localAppData;
        return base ? path.join(base, "GoLiveBypassBD") : null;
    }

    get statusPath() {
        return this.dataDir ? path.join(this.dataDir, "native-status.json") : null;
    }

    get nativeLogPath() {
        return this.dataDir ? path.join(this.dataDir, "native.log") : null;
    }

    get rendererLogPath() {
        return this.dataDir ? path.join(this.dataDir, "renderer.log") : null;
    }

    start() {
        this.startedAt = Date.now();
        this.safeMkdir();
        this.logRenderer("diagnostics.start", {
            plugin: "GoLiveDeQueijoDiagnostics",
            version: "1.0.0"
        });

        this.installDispatcherTrace();
        this.tick();

        this.timer = setInterval(() => this.tick(), Math.max(500, Number(this.settings.pollMs) || 1000));
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;

        try {
            this.api.Patcher.unpatchAll();
        } catch {}

        this.logRenderer("diagnostics.stop", {});
    }

    safeMkdir() {
        try {
            if (this.dataDir) fs.mkdirSync(this.dataDir, {recursive: true});
        } catch {}
    }

    saveSettings() {
        this.api.Data.save("settings", this.settings);
    }

    readJson(file) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            return null;
        }
    }

    readMainSettings() {
        try {
            return this.mainApi.Data.load("settings") || {};
        } catch {
            return {};
        }
    }

    tail(file, maxLines = 120) {
        try {
            if (!file || !fs.existsSync(file)) return [];
            const text = fs.readFileSync(file, "utf8");
            const lines = text.split(/\r?\n/).filter(Boolean);
            return lines.slice(-maxLines);
        } catch (e) {
            return [`[erro lendo ${file || "arquivo"}] ${e.message}`];
        }
    }

    trimRendererLog() {
        try {
            const file = this.rendererLogPath;
            if (!file || !fs.existsSync(file)) return;
            const stat = fs.statSync(file);
            if (stat.size < 512 * 1024) return;

            const keep = this.tail(file, 1000).join("\n") + "\n";
            fs.writeFileSync(file, keep, "utf8");
        } catch {}
    }

    sanitize(value) {
        if (value == null) return value;
        if (typeof value === "boolean" || typeof value === "number") return value;

        if (typeof value === "string") {
            if (value.length > 180) return value.slice(0, 180) + "…";
            return value
                .replace(/(socks5?:\/\/)([^@\s/]+)@/gi, "$1***:***@")
                .replace(/([?&](?:token|key|auth|authorization)=)[^&\s]+/gi, "$1***");
        }

        return undefined;
    }

    safeEventSummary(event) {
        const out = {type: String(event?.type || "?")};

        const keys = [
            "state", "status", "region", "hostname", "endpoint",
            "quality", "mode", "reason", "result", "connected"
        ];

        for (const key of keys) {
            const v = this.sanitize(event?.[key]);
            if (v !== undefined) out[key] = v;
        }

        if (event?.streamKey != null) out.streamKey = "<present>";
        if (event?.token != null) out.token = "<redacted>";
        if (event?.secretKey != null) out.secretKey = "<redacted>";

        return out;
    }

    logRenderer(kind, data = {}) {
        try {
            this.safeMkdir();
            const line = `${new Date().toISOString()} [${kind}] ${JSON.stringify(data)}\n`;
            fs.appendFileSync(this.rendererLogPath, line, "utf8");
            this.trimRendererLog();
        } catch {}
    }

    installDispatcherTrace() {
        try {
            const dispatcher = BdApi.Webpack.getModule(
                m => m && typeof m.dispatch === "function" &&
                     typeof m.subscribe === "function" &&
                     typeof m.unsubscribe === "function",
                {searchExports: true}
            );

            if (!dispatcher) {
                this.logRenderer("dispatcher", {state: "not-found"});
                return;
            }

            this.dispatcher = dispatcher;

            this.api.Patcher.before(dispatcher, "dispatch", (_, args) => {
                const event = args?.[0];
                const type = String(event?.type || "");

                if (!/(STREAM|VOICE|RTC|MEDIA|VIDEO|CONNECTION_OPEN|CALL|GUILD_CREATE)/i.test(type)) {
                    return;
                }

                this.logRenderer("flux", this.safeEventSummary(event));
            });

            this.logRenderer("dispatcher", {state: "patched"});
        } catch (e) {
            this.logRenderer("dispatcher.error", {message: String(e?.message || e)});
        }
    }

    getStoreByKeys(...keys) {
        try {
            return BdApi.Webpack.getByKeys(...keys);
        } catch {
            return null;
        }
    }

    getMediaSnapshot() {
        const result = {
            activeStream: false,
            activeStreamKeys: [],
            rtcHints: {},
            errors: []
        };

        try {
            const streaming = this.getStoreByKeys("getCurrentUserActiveStream");
            const current = streaming?.getCurrentUserActiveStream?.();
            result.activeStream = !!current;

            if (current) {
                result.activeStreamInfo = {
                    hasGuildId: current.guildId != null,
                    hasChannelId: current.channelId != null,
                    hasStreamKey: current.streamKey != null
                };
            }
        } catch (e) {
            result.errors.push(`ApplicationStreamingStore: ${e.message}`);
        }

        try {
            const streamRtc = this.getStoreByKeys("getAllActiveStreamKeys");
            const keys = streamRtc?.getAllActiveStreamKeys?.();
            if (Array.isArray(keys)) {
                result.activeStreamKeys = keys.map(() => "<stream-key>").slice(0, 12);
            }
        } catch (e) {
            result.errors.push(`StreamRTCConnectionStore: ${e.message}`);
        }

        try {
            const rtc = BdApi.Webpack.getModule(
                m => m && (
                    typeof m.getRTCConnectionState === "function" ||
                    typeof m.getConnectionState === "function"
                ),
                {searchExports: true}
            );

            if (rtc) {
                for (const method of ["getRTCConnectionState", "getConnectionState"]) {
                    if (typeof rtc[method] !== "function") continue;
                    try {
                        const v = rtc[method]();
                        const s = this.sanitize(v);
                        if (s !== undefined) result.rtcHints[method] = s;
                    } catch {}
                }
            }
        } catch (e) {
            result.errors.push(`RTC store: ${e.message}`);
        }

        result.hasRecentMedia =
            result.activeStream ||
            result.activeStreamKeys.length > 0;

        return result;
    }

    hasActiveMedia(snapshot = this.lastSnapshot?.media) {
        return !!(
            snapshot?.activeStream ||
            (Array.isArray(snapshot?.activeStreamKeys) && snapshot.activeStreamKeys.length)
        );
    }

    buildSnapshot() {
        const nativeStatus = this.readJson(this.statusPath) || {};
        const mainSettings = this.readMainSettings();
        const media = this.getMediaSnapshot();

        const manualRaw = String(mainSettings.manualProxy || "").trim();
        const manualMasked = manualRaw
            ? manualRaw.replace(/(socks5?:\/\/)([^@\s/]+)@/gi, "$1***:***@")
            : "";

        const warnings = [];

        if (String(mainSettings.voiceRegion || "").toLowerCase() === "brazil") {
            warnings.push("Voice Region está forçada para brazil. Use Automática enquanto testa.");
        }

        if (nativeStatus.gatewayViaProxy === false) {
            warnings.push("Gateway atual não está passando pela proxy.");
        }

        if (nativeStatus.directFallback === true) {
            warnings.push(`Fallback DIRECT ativo: ${nativeStatus.directReason || "sem motivo informado"}.`);
        }

        if (nativeStatus.ms != null && Number(nativeStatus.ms) > 2500) {
            warnings.push(`Proxy muito lenta (${nativeStatus.ms} ms). Prefira a 3proxy privada.`);
        }

        return {
            at: new Date().toISOString(),
            native: nativeStatus,
            main: {
                manualProxy: manualMasked || "(automática)",
                manualProxyEnabled: !!manualRaw,
                voiceRegion: mainSettings.voiceRegion || "AUTOMÁTICA"
            },
            media,
            warnings
        };
    }

    tick() {
        const snap = this.buildSnapshot();
        const native = snap.native || {};

        const routeId =
            native.gatewayRouteId ??
            native.gatewayTransitionId ??
            null;

        const gatewayAt = native.lastGatewayAt || null;

        if (this.lastGatewayRouteId == null && routeId != null) {
            this.lastGatewayRouteId = routeId;
        } else if (
            routeId != null &&
            this.lastGatewayRouteId != null &&
            String(routeId) !== String(this.lastGatewayRouteId)
        ) {
            const previous = this.lastGatewayRouteId;
            this.lastGatewayRouteId = routeId;

            this.onGatewayReconnect(snap, previous, routeId);
        } else if (
            routeId == null &&
            this.lastGatewayAt &&
            gatewayAt &&
            gatewayAt !== this.lastGatewayAt
        ) {
            this.onGatewayReconnect(snap, this.lastGatewayAt, gatewayAt);
        }

        if (gatewayAt) this.lastGatewayAt = gatewayAt;
        this.lastSnapshot = snap;
    }

    onGatewayReconnect(snapshot, from, to) {
        const active = this.hasActiveMedia(snapshot.media);

        this.logRenderer("gateway.reconnect", {
            from: String(from),
            to: String(to),
            activeMedia: active,
            host: snapshot.native?.lastGatewayHost || null,
            viaProxy: snapshot.native?.gatewayViaProxy ?? null
        });

        if (active) {
            BdApi.UI.showToast(
                "Go Live Debug: o Gateway reconectou com mídia ativa. Evitei reload automático; isso pode causar RTC Connecting/loading infinito.",
                {type: "warning", timeout: 10000}
            );
            return;
        }

        if (!this.settings.autoRecoverRtc) return;

        // Ignore early boot migration and only recover a renderer that has been alive.
        if (Date.now() - this.startedAt < 15000) {
            this.logRenderer("rtc.recovery.skip", {reason: "early-boot"});
            return;
        }

        const marker = String(to);
        const alreadyHandled = this.api.Data.load("lastRecoveredGatewayRoute");

        if (alreadyHandled === marker) return;

        this.api.Data.save("lastRecoveredGatewayRoute", marker);
        this.logRenderer("rtc.recovery.reload", {route: marker});

        BdApi.UI.showToast(
            "Go Live Debug: Gateway reconectou sem Live ativa. Recarregando o renderer para limpar possível RTC travado...",
            {type: "info", timeout: 5000}
        );

        setTimeout(() => {
            try {
                window.location.reload();
            } catch (e) {
                this.logRenderer("rtc.recovery.reload.error", {message: e.message});
            }
        }, 1200);
    }

    diagnosticText() {
        const snap = this.buildSnapshot();
        const nativeLines = this.tail(this.nativeLogPath, 100);
        const rendererLines = this.tail(this.rendererLogPath, 100);

        return [
            "Go Live De Queijo - RTC/Gateway Diagnostics",
            `gerado: ${new Date().toISOString()}`,
            "",
            "== RESUMO ==",
            `manualProxy: ${snap.main.manualProxy}`,
            `voiceRegion: ${snap.main.voiceRegion}`,
            `gateway state: ${snap.native?.state || "?"}`,
            `gateway host: ${snap.native?.lastGatewayHost || "?"}`,
            `gateway via proxy: ${snap.native?.gatewayViaProxy ?? "?"}`,
            `gateway route id: ${snap.native?.gatewayRouteId ?? "?"}`,
            `gateway transition: ${snap.native?.gatewayTransitionId ?? "?"}`,
            `country: ${snap.native?.current?.country || snap.native?.country || "?"}`,
            `proxy ms: ${snap.native?.current?.ms ?? snap.native?.ms ?? "?"}`,
            `active stream: ${snap.media.activeStream ? "SIM" : "NÃO"}`,
            `active RTC stream keys: ${snap.media.activeStreamKeys.length}`,
            "",
            "== AVISOS ==",
            ...(snap.warnings.length ? snap.warnings : ["nenhum aviso automático"]),
            "",
            "== NATIVE STATUS ==",
            JSON.stringify(snap.native, null, 2),
            "",
            "== NATIVE LOG (últimas 100) ==",
            ...nativeLines,
            "",
            "== RENDERER/STREAM LOG (últimas 100) ==",
            ...rendererLines
        ].join("\n");
    }

    copyDiagnostic() {
        try {
            BdApi.Native.clipboard.copy(this.diagnosticText());
            BdApi.UI.showToast("Diagnóstico copiado.", {type: "success"});
        } catch {
            try {
                navigator.clipboard.writeText(this.diagnosticText());
                BdApi.UI.showToast("Diagnóstico copiado.", {type: "success"});
            } catch (e) {
                BdApi.UI.alert("Go Live Diagnostics", this.diagnosticText());
            }
        }
    }

    clearRendererLog() {
        try {
            if (this.rendererLogPath) fs.writeFileSync(this.rendererLogPath, "", "utf8");
            BdApi.UI.showToast("renderer.log limpo.", {type: "success"});
        } catch (e) {
            BdApi.UI.showToast(`Falha ao limpar log: ${e.message}`, {type: "error"});
        }
    }

    getSettingsPanel() {
        const React = BdApi.React;
        const plugin = this;

        const rootStyle = {
            width: "100%",
            maxWidth: "1100px",
            padding: "18px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
        };

        const gridStyle = {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "10px"
        };

        const cardStyle = {
            border: "1px solid var(--background-modifier-accent)",
            borderRadius: "10px",
            padding: "12px",
            background: "var(--background-secondary)"
        };

        const valueStyle = {
            marginTop: "5px",
            fontFamily: "var(--font-code)",
            overflowWrap: "anywhere"
        };

        const logStyle = {
            width: "100%",
            maxHeight: "320px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontFamily: "var(--font-code)",
            fontSize: "12px",
            lineHeight: "1.45",
            boxSizing: "border-box",
            margin: 0
        };

        const buttonStyle = {
            padding: "8px 12px",
            borderRadius: "7px",
            border: "1px solid var(--background-modifier-accent)",
            cursor: "pointer",
            background: "var(--button-secondary-background)",
            color: "var(--interactive-active)"
        };

        function Panel() {
            const [snap, setSnap] = React.useState(() => plugin.buildSnapshot());
            const [nativeLog, setNativeLog] = React.useState(() => plugin.tail(plugin.nativeLogPath, plugin.settings.maxUiLogLines));
            const [rendererLog, setRendererLog] = React.useState(() => plugin.tail(plugin.rendererLogPath, plugin.settings.maxUiLogLines));

            React.useEffect(() => {
                const id = setInterval(() => {
                    setSnap(plugin.buildSnapshot());
                    setNativeLog(plugin.tail(plugin.nativeLogPath, plugin.settings.maxUiLogLines));
                    setRendererLog(plugin.tail(plugin.rendererLogPath, plugin.settings.maxUiLogLines));
                }, 1000);

                return () => clearInterval(id);
            }, []);

            const native = snap.native || {};
            const cards = [
                ["Gateway", native.state || "?"],
                ["Via proxy", String(native.gatewayViaProxy ?? "?")],
                ["Host", native.lastGatewayHost || "?"],
                ["Route ID", String(native.gatewayRouteId ?? "?")],
                ["Proxy", snap.main.manualProxy],
                ["País", native.current?.country || native.country || "?"],
                ["Latência", `${native.current?.ms ?? native.ms ?? "?"} ms`],
                ["Voice region", snap.main.voiceRegion],
                ["Live detectada", snap.media.activeStream ? "SIM" : "NÃO"],
                ["RTC stream keys", String(snap.media.activeStreamKeys.length)]
            ];

            return React.createElement(
                "div",
                {style: rootStyle},
                React.createElement("h2", null, "Go Live — Gateway / RTC Debug"),
                React.createElement(
                    "div",
                    {style: gridStyle},
                    cards.map(([label, value]) =>
                        React.createElement(
                            "div",
                            {style: cardStyle, key: label},
                            React.createElement("strong", null, label),
                            React.createElement("div", {style: valueStyle}, value)
                        )
                    )
                ),
                snap.warnings.length
                    ? React.createElement(
                        "div",
                        {style: cardStyle},
                        React.createElement("strong", null, "Avisos automáticos"),
                        React.createElement(
                            "ul",
                            null,
                            snap.warnings.map((w, i) => React.createElement("li", {key: i}, w))
                        )
                    )
                    : null,
                React.createElement(
                    "label",
                    {style: {...cardStyle, display: "flex", alignItems: "center", gap: "10px"}},
                    React.createElement("input", {
                        type: "checkbox",
                        checked: !!plugin.settings.autoRecoverRtc,
                        onChange: e => {
                            plugin.settings.autoRecoverRtc = !!e.target.checked;
                            plugin.saveSettings();
                            setSnap(plugin.buildSnapshot());
                        }
                    }),
                    React.createElement(
                        "span",
                        null,
                        "Auto-recuperar RTC: recarregar o renderer quando o Gateway reconectar e não houver Live detectada."
                    )
                ),
                React.createElement(
                    "div",
                    {style: {display: "flex", flexWrap: "wrap", gap: "8px"}},
                    React.createElement("button", {style: buttonStyle, onClick: () => plugin.copyDiagnostic()}, "Copiar diagnóstico"),
                    React.createElement("button", {
                        style: buttonStyle,
                        onClick: () => {
                            plugin.clearRendererLog();
                            setRendererLog([]);
                        }
                    }, "Limpar log da tela"),
                    React.createElement("button", {
                        style: buttonStyle,
                        onClick: () => window.location.reload()
                    }, "Recarregar Discord")
                ),
                React.createElement(
                    "div",
                    {style: cardStyle},
                    React.createElement("strong", null, "Renderer / STREAM / VOICE / RTC"),
                    React.createElement("pre", {style: logStyle}, rendererLog.join("\n") || "(sem eventos ainda)")
                ),
                React.createElement(
                    "div",
                    {style: cardStyle},
                    React.createElement("strong", null, "Native / Gateway / Proxy"),
                    React.createElement("pre", {style: logStyle}, nativeLog.join("\n") || "(native.log ainda vazio)")
                )
            );
        }

        return React.createElement(Panel);
    }
};
