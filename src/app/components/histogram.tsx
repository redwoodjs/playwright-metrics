type HistogramProps = {
  results: ("pass" | "flaky" | "fail" | "skip")[];
};

/**
 * Histogram component that displays recent test execution results
 * as colored squares (green for pass, red for flaky/fail, gray for skip)
 */
export const Histogram = ({ results }: HistogramProps) => {
  return (
    <div className="flex gap-0.5">
      {results.map((result, index) => {
        let bgColor = "bg-red-500";
        if (result === "pass") bgColor = "bg-green-500";
        if (result === "skip") bgColor = "bg-gray-300";

        return (
          <div
            key={index}
            className={`w-3 h-3 ${bgColor}`}
          />
        );
      })}
    </div>
  );
};
