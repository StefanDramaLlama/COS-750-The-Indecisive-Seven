import { progressHandler } from "../src/server/handlers.js";
import { toNodeHandler } from "../src/server/http.js";

export default toNodeHandler(progressHandler);
