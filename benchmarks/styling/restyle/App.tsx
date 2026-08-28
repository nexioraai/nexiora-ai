import { createFixtureApp } from "../fixture-core/app-shell";
import { primitives, Root, useThemeBridge } from "./candidate";

export default createFixtureApp({ name: "restyle", primitives, useThemeBridge, Root });
