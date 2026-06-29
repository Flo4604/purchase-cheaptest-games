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
import { colors, space } from "../tokens.stylex";
import { Select } from "./Select.js";
import { Button, Checkbox, Field, TextInput } from "./ui.js";

const JOB_TYPES: { label: string; value: JobType }[] = [
	{ label: "Buy games", value: "buy" },
	{ label: "Sell items", value: "sell" },
	{ label: "Turn into gems", value: "gems" },
	{ label: "Clean up listings", value: "cleanup" },
	{ label: "Redeem apps", value: "redeem" },
	{ label: "Activate keys", value: "activate" },
];

const s = stylex.create({
	form: { display: "flex", flexDirection: "column", gap: space.md },
	flagsLabel: { fontSize: "12px", fontWeight: 500, color: colors.muted, marginBottom: "2px" },
	flags: { display: "flex", flexDirection: "column", gap: space.sm },
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
			<Field label={field.label}>
				<Select
					value={String(value)}
					onChange={onChange}
					options={(field.options ?? []).map((o) => ({ label: o.label, value: o.value }))}
				/>
			</Field>
		);

	if (field.kind === "checkbox")
		return <Checkbox checked={Boolean(value)} onChange={onChange} label={field.label} />;

	if (field.kind === "flags") {
		const current = Number(value);
		return (
			<div>
				<div {...stylex.props(s.flagsLabel)}>{field.label}</div>
				<div {...stylex.props(s.flags)}>
					{field.flags?.map((f) => (
						<Checkbox
							key={f.bit}
							checked={(current & f.bit) !== 0}
							onChange={(on) => onChange(on ? current | f.bit : current & ~f.bit)}
							label={f.label}
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<Field label={field.label}>
			<TextInput
				type={field.kind === "number" ? "number" : "text"}
				value={String(value ?? "")}
				onChange={(e) =>
					onChange(
						field.kind === "number"
							? e.target.value === ""
								? 0
								: Number(e.target.value)
							: e.target.value,
					)
				}
			/>
		</Field>
	);
}

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
			onLaunched?.();
			navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) } });
		},
	});

	return (
		<div {...stylex.props(s.form)}>
			<Field label="Flow">
				<Select
					value={type}
					onChange={(v) => changeType(v as JobType)}
					options={JOB_TYPES}
				/>
			</Field>

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
