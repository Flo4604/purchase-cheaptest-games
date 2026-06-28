import { createConsola } from "consola";

const logger = createConsola({
	fancy: true,
	defaults: {
		additionalColor: "white",
	},
});

export default logger;
