"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-border !shadow-lg !font-sans",
          description: "!text-muted-foreground whitespace-pre-line",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
