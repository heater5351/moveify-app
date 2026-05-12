/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  darkMode: ["selector", "[data-web-theme=dark]"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#132232",
          color: "#fff",
          light: {
            1: "#f5f6f8",
            2: "#ebeef2",
            3: "#dfe3e9",
            4: "#d0d6df",
            5: "#bec6d2",
            6: "#a9b4c3",
            7: "#919eb1",
            8: "#76869d",
            9: "#5a6c87",
            10: "#3d5270",
            11: "#253b5a",
            12: "#132232",
          },
          dark: {
            1: "#0f1c29",
            2: "#0c171f",
            3: "#091216",
            4: "#070e10",
            5: "#05090b",
            6: "#030507",
            7: "#020304",
            8: "#010101",
            9: "#132232",
            10: "#1a2e3e",
            11: "#253b5a",
            12: "#3d5270",
          },
        },
        accent: {
          DEFAULT: "#46c1c0",
          dark: "#045e62",
          light: "#7dd7d6",
        },
        body: {
          light: {
            1: "#fcfcfd",
            2: "#f9f9fb",
            3: "#eff0f3",
            4: "#e7e8ec",
            5: "#e0e1e6",
            6: "#d8d9e0",
            7: "#cdced7",
            8: "#b9bbc6",
            9: "#8b8d98",
            10: "#80828d",
            11: "#62636c",
            12: "#1e1f24",
          },
          dark: {
            1: "#212224",
            2: "#28292b",
            3: "#303134",
            4: "#36373b",
            5: "#3c3d42",
            6: "#43444a",
            7: "#4f5058",
            8: "#666872",
            9: "#72747f",
            10: "#7d7f8a",
            11: "#b4b6bf",
            12: "#eeeef0",
          },
        },
      },
      borderColor: {
        alpha: {
          light: "#00073527",
          dark: "#d6dbfc2f",
        },
      },
      backgroundColor: {
        body: {
          striped: {
            light: "#00005506",
            dark: "#adc5f30f",
          },
        },
      },
      boxShadow: {
        "card-1": "0px 0px 40px 0px rgba(0, 0, 0, 0.08)",
        "card-2": "0px 10px 20px 0 rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
