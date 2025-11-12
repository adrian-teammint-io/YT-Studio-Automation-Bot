const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config();

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
  mode: isProduction ? "production" : "development",
  devtool: isProduction ? false : "inline-source-map",
  entry: {
    popup: "./extension/index.tsx",
    background: "./extension/background.ts",
    content: "./extension/content.ts",
    "yt-analytics-content": "./extension/yt-analytics-content.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.extension.json",
          },
        },
        exclude: [
          /node_modules/,
          /-esm\.ts$/, // Exclude ESM-specific files (for standalone Node.js scripts)
        ],
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "public/manifest.json", to: "manifest.json" },
        { from: "extension/popup.html", to: "popup.html" },
        { from: "icons/icon16.png", to: "icon16.png" },
        { from: "icons/icon32.png", to: "icon32.png" },
        { from: "icons/icon48.png", to: "icon48.png" },
        { from: "icons/icon128.png", to: "icon128.png" },
        { from: "public/google-sheets-icon.png", to: "google-sheets-icon.png" },
      ],
    }),
    new webpack.DefinePlugin({
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_URL
      ),
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
    }),
  ],
  };
};
