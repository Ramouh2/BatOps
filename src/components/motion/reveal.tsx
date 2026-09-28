"use client";

import type { ComponentProps } from "react";
import { motion } from "motion/react";
import { fadeUp, stagger } from "@/lib/motion";

/** Section qui apparaît en glissant légèrement vers le haut. */
export function Reveal({ delay = 0, ...props }: ComponentProps<typeof motion.div> & { delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ delay }}
      {...props}
    />
  );
}

/** Conteneur dont les enfants `StaggerItem` apparaissent en cascade. */
export function Stagger({
  interval = 0.06,
  delay = 0,
  ...props
}: ComponentProps<typeof motion.div> & { interval?: number; delay?: number }) {
  return <motion.div variants={stagger(interval, delay)} initial="hidden" animate="show" {...props} />;
}

export function StaggerItem(props: ComponentProps<typeof motion.div>) {
  return <motion.div variants={fadeUp} {...props} />;
}
