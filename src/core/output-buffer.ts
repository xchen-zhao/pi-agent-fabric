export interface OutputBufferOptions {
  maxBytes: number;
  maxLines: number;
}

export class BoundedOutputBuffer {
  private value = "";
  private wasTruncated = false;

  constructor(private readonly options: OutputBufferOptions) {}

  append(chunk: string): void {
    this.value += chunk;
    this.trim();
  }

  get content(): string {
    return this.wasTruncated ? `[Earlier output truncated]\n${this.value}` : this.value;
  }

  get truncated(): boolean {
    return this.wasTruncated;
  }

  private trim(): void {
    const lines = this.value.split("\n");
    if (lines.length > this.options.maxLines) {
      this.value = lines.slice(lines.length - this.options.maxLines).join("\n");
      this.wasTruncated = true;
    }

    while (Buffer.byteLength(this.value, "utf8") > this.options.maxBytes && this.value.length > 0) {
      const excess = Buffer.byteLength(this.value, "utf8") - this.options.maxBytes;
      this.value = this.value.slice(Math.max(1, Math.ceil(excess / 2)));
      this.wasTruncated = true;
    }
  }
}
