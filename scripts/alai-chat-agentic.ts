import readline from "node:readline";
import { spawnSync } from "node:child_process";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("Soy ALAI. Modo agentic reasoning activo. Escribe 'salir' para terminar.");

function ask() {
  rl.question("\nTú: ", (input) => {
    const q = input.trim();

    if (!q || q.toLowerCase() === "salir" || q.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    spawnSync("npm", ["run", "alai:conversational-reasoning", "--", q], {
      stdio: "inherit"
    });

    ask();
  });
}

ask();
