import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Account, api, type JobType } from "../lib/api.js";
import {
	buildConfig,
	type FieldValue,
	type FlowField,
	FLOW_FIELDS,
	initialValues,
} from "../lib/flows.js";
import { colors, radius, space } from "../tokens.stylex";
import { Button } from "./ui.js";

const JOB_TYPES: JobType[] = ["buy", "sell", "cleanup", "gems", "redeem", "activate"];

const s = stylex.create({
	wrap: { display: "flex", flexDirection: "column", gap: space.sm, borderTop: `1px solid ${colors.border}`, paddingTop: space.md },
	control: { background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${space.sm} ${space.md}`, fontSize: "14px", width: "100%", boxSizing: "border-box" },
	label: { fontSize: "12px", color: colors.muted },
	field: { display: "flex", flexDirection: "column", gap: space.xs },
	flagRow: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "13px", color: colors.text },
	flags: { display: "flex", flexDirection: "column", gap: space.xs },
	check: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "14px", color: colors.text },
	error: { color: colors.danger, fontSize: "13px" },
});

function FieldInput({
	field,
	value,
	onChange,
}: {
	field: FlowField;
	value: FieldValue;
	onChange: (v: FieldValue) => void;
}) {
	if (field.kind === "select")
		return (
			<label {...stylex.props(s.field)}>
				<span {...stylex.props(s.label)}>{field.label}</span>
				<select {...stylex.props(s.control)} value={String(value)} onChange={(e) => onChange(e.target.value)}>
					{field.options?.map((o) => (
						<option key={o.value} value={o.value}>{o.label}</option>
					))}
				</select>
			</label>
		);

	if (field.kind === "checkbox")
		return (
			<label {...stylex.props(s.check)}>
				<input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
				{field.label}
			</label>
		);

	if (field.kind === "flags") {
		const current = Number(value);
		return (
			<div {...stylex.props(s.field)}>
				<span {...stylex.props(s.label)}>{field.label}</span>
				<div {...stylex.props(s.flags)}>
					{field.flags?.map((f) => (
						<label key={f.bit} {...stylex.props(s.flagRow)}>
							<input
								type="checkbox"
								checked={(current & f.bit) !== 0}
								onChange={(e) => onChange(e.target.checked ? current | f.bit : current & ~f.bit)}
							/>
							{f.label}
						</label>
					))}
				</div>
			</div>
		);
	}

	// text / number / csv
	return (
		<label {...stylex.props(s.field)}>
			<span {...stylex.props(s.label)}>{field.label}</span>
			<input
				{...stylex.props(s.control)}
				type={field.kind === "number" ? "number" : "text"}
				value={String(value ?? "")}
				onChange={(e) =>
					onChange(field.kind === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value)
				}
			/>
		</label>
	);
}

export function JobLauncher({ account }: { account: Account }) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [type, setType] = useState<JobType>("buy");
	const [values, setValues] = useState<Record<string, FieldValue>>(() =>
		initialValues("buy", account),
	);

	const changeType = (t: JobType) => {
		setType(t);
		setValues(initialValues(t, account));
	};

	const run = useMutation({
		mutationFn: () => api.startJob(account.id, type, { config: buildConfig(type, values, account) }),
		onSuccess: ({ jobId }) => {
			qc.invalidateQueries({ queryKey: ["jobs", account.id] });
			navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) } });
		},
	});

	return (
		<div {...stylex.props(s.wrap)}>
			<label {...stylex.props(s.field)}>
				<span {...stylex.props(s.label)}>Flow</span>
				<select {...stylex.props(s.control)} value={type} onChange={(e) => changeType(e.target.value as JobType)}>
					{JOB_TYPES.map((t) => (
						<option key={t} value={t}>{t}</option>
					))}
				</select>
			</label>

			{FLOW_FIELDS[type].map((field) => (
				<FieldInput
					key={field.name}
					field={field}
					value={values[field.name] ?? ""}
					onChange={(v) => setValues((p) => ({ ...p, [field.name]: v }))}
				/>
			))}

			{run.isError && <span {...stylex.props(s.error)}>{(run.error as Error).message}</span>}
			<Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
				{run.isPending ? "Starting…" : `Run ${type}`}
			</Button>
		</div>
	);
}
