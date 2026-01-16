type HistogramProps = {
  results: ("pass" | "flaky" | "fail")[];
};

/**
 * Histogram component that displays recent test execution results
 * as colored squares (green for pass, red for flaky/fail)
 */
export const Histogram = ({ results }: HistogramProps) => {
  return (
    <div className="flex gap-0.5">
      {results.map((result, index) => {
        const isPass = result === "pass";
        return (
          <div
            key={index}
            className={`w-3 h-3 ${
              isPass ? "bg-green-500" : "bg-red-500"
            }`}
          />
        );
      })}
    </div>
  );
};
