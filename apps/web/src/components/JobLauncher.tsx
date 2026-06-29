import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Account, api, type JobType } from "../lib/api.js";
import {
	buildConfig,
	BUYING_FLAGS,
	defaultCfg,
	type FlowCfg,
	FLOW_TABS,
	REDUCTION,
	SELLING_FLAGS,
	STRATEGIES,
	summarize,
} from "../lib/flows.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { Select } from "./Select.js";
import {
	Button,
	ChipGroup,
	Field,
	Segmented,
	Switch,
	Textarea,
	TextInput,
} from "./ui.js";

const s = stylex.create({
	form: { display: "flex", flexDirection: "column", gap: space.lg },
	tabs: { overflowX: "auto" },
	fields: { display: "flex", flexDirection: "column", gap: space.md },
	summary: {
		fontSize: "13px",
		color: colors.muted,
		fontFamily: font.mono,
		lineHeight: 1.5,
		padding: `${space.sm} ${space.md}`,
		background: colors.bg,
		borderRadius: radius.sm,
		borderLeft: `2px solid ${colors.accent}`,
	},
	error: { color: colors.danger, fontSize: "13px" },
	cur: { color: colors.faint, fontSize: "12px", fontFamily: font.mono },
});

const cleanupOpts = [
	{ label: "Only overpriced", value: "over" },
	{ label: "Remove ALL", value: "all" },
];

export function JobLauncher({
	account,
	onLaunched,
}: {
	account: Account;
	onLaunched?: () => void;
}) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [type, setType] = useState<JobType>("buy");
	const [cfg, setCfg] = useState<FlowCfg>(() => defaultCfg("buy", account));
	const set = (patch: Partial<FlowCfg>) => setCfg((c) => ({ ...c, ...patch }));
	const currency = account.cachedWalletCurrency ?? "";

	const changeType = (t: JobType) => {
		setType(t);
		setCfg(defaultCfg(t, account));
	};

	const run = useMutation({
		mutationFn: () => api.startJob(account.id, type, { config: buildConfig(type, cfg, account) }),
		onSuccess: ({ jobId }) => {
			qc.invalidateQueries({ queryKey: ["jobs", account.id] });
			onLaunched?.();
			navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) } });
		},
	});

	const num = (key: keyof FlowCfg) => (e: React.ChangeEvent<HTMLInputElement>) =>
		set({ [key]: e.target.value === "" ? 0 : Number(e.target.value) } as Partial<FlowCfg>);

	return (
		<div {...stylex.props(s.form)}>
			<div {...stylex.props(s.tabs)}>
				<Segmented value={type} onChange={changeType} options={FLOW_TABS} />
			</div>

			<div {...stylex.props(s.fields)}>
				{type === "buy" && (
					<>
						<Field label="Strategy">
							<Select value={cfg.usage} onChange={(v) => set({ usage: v })} options={STRATEGIES} />
						</Field>
						{cfg.usage === "amount" && (
							<Field label="Number of games">
								<TextInput type="number" value={String(cfg.limit)} onChange={num("limit")} />
							</Field>
						)}
						{cfg.usage === "balance" && (
							<Field label={`Amount to spend ${currency}`.trim()}>
								<TextInput type="number" value={String(cfg.limit)} onChange={num("limit")} />
							</Field>
						)}
						<Field label={`Max price per game ${currency}`.trim()}>
							<TextInput type="number" value={String(cfg.maxPrice)} onChange={num("maxPrice")} />
						</Field>
						<Field label="Only games with">
							<ChipGroup value={cfg.priceOptionsFlag} onChange={(v) => set({ priceOptionsFlag: v })} options={BUYING_FLAGS} />
						</Field>
					</>
				)}

				{(type === "sell" || type === "gems") && (
					<>
						<Field label="Item types">
							<ChipGroup value={cfg.sellOptionsFlag} onChange={(v) => set({ sellOptionsFlag: v })} options={SELLING_FLAGS} />
						</Field>
						<Field label="Price reduction">
							<Segmented value={cfg.priceCalculation} onChange={(v) => set({ priceCalculation: v })} options={REDUCTION} />
						</Field>
						<Field label={cfg.priceCalculation === "fixed" ? `Amount to remove ${currency}`.trim() : "Percent to remove"}>
							<TextInput type="number" value={String(cfg.priceToRemove)} onChange={num("priceToRemove")} />
						</Field>
						{type === "sell" && (
							<>
								<Field label="Minimum price (cents)">
									<TextInput type="number" value={String(cfg.minPrice)} onChange={num("minPrice")} />
								</Field>
								<Switch checked={cfg.instantSell} onChange={(v) => set({ instantSell: v })} label="Instant sell to highest buy order" />
								{cfg.instantSell && (
									<Field label="Max discount %">
										<TextInput type="number" value={String(cfg.instantSellThreshold)} onChange={num("instantSellThreshold")} />
									</Field>
								)}
							</>
						)}
					</>
				)}

				{type === "cleanup" && (
					<Field label="What to remove">
						<Segmented
							value={cfg.removeAll ? "all" : "over"}
							onChange={(v) => set({ removeAll: v === "all" })}
							options={cleanupOpts}
						/>
					</Field>
				)}

				{type === "redeem" && (
					<Field label="App IDs (comma or newline separated)">
						<Textarea value={cfg.list} onChange={(e) => set({ list: e.target.value })} placeholder="730, 440, 570" />
					</Field>
				)}

				{type === "activate" && (
					<Field label="CD keys (one per line)">
						<Textarea value={cfg.keys} onChange={(e) => set({ keys: e.target.value })} placeholder={"XXXXX-XXXXX-XXXXX\nYYYYY-YYYYY-YYYYY"} />
					</Field>
				)}
			</div>

			<div {...stylex.props(s.summary)}>{summarize(type, cfg, account)}</div>

			{run.isError && <span {...stylex.props(s.error)}>{(run.error as Error).message}</span>}
			<Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
				{run.isPending ? "Starting…" : `Run ${type}`}
			</Button>
		</div>
	);
}
