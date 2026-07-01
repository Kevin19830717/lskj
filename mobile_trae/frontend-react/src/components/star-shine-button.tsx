import React from "react"
import { cn } from "@/lib/utils"

interface StarShineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string
  children: React.ReactNode
}

const Star = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 784.11 815.53" className="h-auto w-full" style={{ fill: color }}>
    <path d="M392.05 0c-20.9,210.08-184.06,378.41-392.05,407.78 207.96,29.37 371.12,197.68 392.05,407.74 20.93-210.06 184.09-378.37 392.05-407.74-207.98-29.38-371.16-197.69-392.06-407.78z" />
  </svg>
)

export function StarShineButton({ color = "#22c55e", children, className, ...props }: StarShineButtonProps) {
  const shadowColor = color + "8c"
  const btnId = React.useId().replace(/:/g, "")

  return (
    <>
      <style>{`
        .ssb-${btnId} {
          color: #181818;
          background-color: ${color};
          border: 3px solid ${color};
          box-shadow: 0 0 0 ${shadowColor};
          transition: all 0.3s ease-in-out;
        }
        .ssb-${btnId}:hover {
          background-color: transparent;
          color: ${color};
          box-shadow: 0 0 25px ${shadowColor};
        }
        .ssb-${btnId} .ssb-star {
          transition: all 1s cubic-bezier(0.05,0.83,0.43,0.96);
          filter: drop-shadow(0 0 0 transparent);
        }
        .ssb-${btnId}:hover .ssb-star-0 { top:-80%; left:-30%; filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 1s cubic-bezier(0.05,0.83,0.43,0.96); }
        .ssb-${btnId}:hover .ssb-star-1 { top:-25%; left:10%;  filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 1s cubic-bezier(0,0.4,0,1.01); }
        .ssb-${btnId}:hover .ssb-star-2 { top:55%;  left:25%;  filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 1s cubic-bezier(0,0.4,0,1.01); }
        .ssb-${btnId}:hover .ssb-star-3 { top:30%;  left:80%;  filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 0.8s cubic-bezier(0,0.4,0,1.01); }
        .ssb-${btnId}:hover .ssb-star-4 { top:25%;  left:115%; filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 0.6s cubic-bezier(0,0.4,0,1.01); }
        .ssb-${btnId}:hover .ssb-star-5 { top:5%;   left:60%;  filter: drop-shadow(0 0 10px ${color}); z-index:2; transition:all 0.8s ease-in-out; }
      `}</style>
      <button
        className={cn("ssb-" + btnId, "group relative cursor-pointer rounded-md px-[30px] py-[10px] text-[15px] font-medium active:scale-95", className)}
        {...props}
      >
        {children}
        <div className={`ssb-star ssb-star-0 pointer-events-none absolute z-[-5]`} style={{ top: "20%", left: "20%", width: "25px" }}><Star color={color} /></div>
        <div className={`ssb-star ssb-star-1 pointer-events-none absolute z-[-5]`} style={{ top: "45%", left: "45%", width: "15px" }}><Star color={color} /></div>
        <div className={`ssb-star ssb-star-2 pointer-events-none absolute z-[-5]`} style={{ top: "40%", left: "40%", width: "5px" }}><Star color={color} /></div>
        <div className={`ssb-star ssb-star-3 pointer-events-none absolute z-[-5]`} style={{ top: "20%", left: "40%", width: "8px" }}><Star color={color} /></div>
        <div className={`ssb-star ssb-star-4 pointer-events-none absolute z-[-5]`} style={{ top: "25%", left: "45%", width: "15px" }}><Star color={color} /></div>
        <div className={`ssb-star ssb-star-5 pointer-events-none absolute z-[-5]`} style={{ top: "5%", left: "50%", width: "5px" }}><Star color={color} /></div>
      </button>
    </>
  )
}
