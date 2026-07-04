/**
 * MIT License
 *
 * Copyright (c) 2026 rainy-juzixiao
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Deep-merge two plain objects.  Arrays and scalar values in `source`
 * replace those in `target`; nested plain objects are merged recursively.
 *
 * @param target  The base object (mutated via shallow copy, not in-place).
 * @param source  Partial overrides.  Pass `undefined` to get a copy of target.
 * @returns A new object with all properties from both, where source wins.
 */
export function deepMerge<T>(
    target: T,
    source: Partial<T> | undefined,
): T {
    if (!source) {
        return target;
    }

    const targetRecord = target as Record<string, unknown>;
    const sourceRecord = source as Record<string, unknown>;
    const result: Record<string, unknown> = { ...targetRecord };

    for (const key in sourceRecord) {
        if (Object.prototype.hasOwnProperty.call(sourceRecord, key)) {
            const sourceVal = sourceRecord[key];
            const targetVal = result[key];

            if (
                sourceVal != null &&
                typeof sourceVal === 'object' &&
                !Array.isArray(sourceVal) &&
                targetVal != null &&
                typeof targetVal === 'object' &&
                !Array.isArray(targetVal)
            ) {
                result[key] = deepMerge(
                    targetVal as Record<string, unknown>,
                    sourceVal as Record<string, unknown>,
                );
            } else if (sourceVal !== undefined) {
                result[key] = sourceVal;
            }
        }
    }

    return result as T;
}
