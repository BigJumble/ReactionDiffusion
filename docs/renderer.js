export class Renderer {
    static #canvas;
    static WIDTH = 1024;
    static HEIGHT = 1024;
    static #device;
    static #context;
    static #presentationFormat;
    static #shaderModule;
    static #uniformBuffer;
    static #bufferA;
    static #bufferB;
    static #uniformDrawBuffer;
    static #renderPipeline;
    static #computePipeline;
    static #computePipelineDraw;
    static #computeBindGroupLayout;
    static #renderBindGroupLayout;
    static #computeBindGroupLayoutDraw;
    static #computeBindGroupA;
    static #computeBindGroupB;
    static #computeBindGroupADraw;
    static #computeBindGroupBDraw;
    static #renderBindGroupA;
    static #renderBindGroupB;
    static #step = 0;
    static isDrawing = false;
    static async init() {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }
        this.#device = await adapter.requestDevice();
        this.#canvas = document.getElementById("gameCanvas");
        this.#canvas.width = this.WIDTH;
        this.#canvas.height = this.HEIGHT;
        this.#context = this.#canvas.getContext("webgpu");
        this.#presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.#context.configure({
            device: this.#device,
            format: this.#presentationFormat,
        });
        this.#shaderModule = this.#device.createShaderModule({
            code: await this.#getShaderCode('./shaders/RD.wgsl'),
        });
        this.#initializeBuffers();
        this.#initializePipelines();
        this.#initializeBindGroups();
    }
    static #initializeBuffers() {
        this.#uniformDrawBuffer = this.#device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#uniformBuffer = this.#device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM,
            mappedAtCreation: true,
        });
        new Uint32Array(this.#uniformBuffer.getMappedRange()).set(new Uint32Array([this.WIDTH, this.HEIGHT]));
        this.#uniformBuffer.unmap();
        const bufferSize = this.WIDTH * this.HEIGHT * 4 * 2;
        const data = new Float32Array(this.WIDTH * this.HEIGHT * 2);
        for (let i = 0; i < this.WIDTH * this.HEIGHT; i++) {
            data[2 * i] = 1;
            data[2 * i + 1] = 0;
        }
        for (let x = this.WIDTH / 2 - 50; x < this.WIDTH / 2 + 50; x++) {
            for (let y = this.HEIGHT / 2 - 50; y < this.HEIGHT / 2 + 50; y++) {
                data[(x + y * this.WIDTH) * 2 + 1] = 1;
            }
        }
        this.#bufferA = this.#device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        new Float32Array(this.#bufferA.getMappedRange()).set(data);
        this.#bufferA.unmap();
        this.#bufferB = this.#device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE,
        });
    }
    static #initializePipelines() {
        this.#computePipeline = this.#device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.#shaderModule,
                entryPoint: "computeMain",
            },
        });
        this.#computePipelineDraw = this.#device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.#shaderModule,
                entryPoint: "computeDraw",
            },
        });
        this.#renderPipeline = this.#device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: this.#shaderModule,
                entryPoint: "vertexMain",
            },
            fragment: {
                module: this.#shaderModule,
                entryPoint: "fragmentMain",
                targets: [{ format: this.#presentationFormat }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });
    }
    static #initializeBindGroups() {
        this.#computeBindGroupLayout = this.#computePipeline.getBindGroupLayout(0);
        this.#computeBindGroupLayoutDraw = this.#computePipelineDraw.getBindGroupLayout(0);
        this.#renderBindGroupLayout = this.#renderPipeline.getBindGroupLayout(0);
        this.#computeBindGroupA = this.#device.createBindGroup({
            layout: this.#computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 2, resource: { buffer: this.#bufferA } },
                { binding: 3, resource: { buffer: this.#bufferB } },
            ],
        });
        this.#computeBindGroupB = this.#device.createBindGroup({
            layout: this.#computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 2, resource: { buffer: this.#bufferB } },
                { binding: 3, resource: { buffer: this.#bufferA } },
            ],
        });
        this.#computeBindGroupADraw = this.#device.createBindGroup({
            layout: this.#computeBindGroupLayoutDraw,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 1, resource: { buffer: this.#uniformDrawBuffer } },
                { binding: 3, resource: { buffer: this.#bufferB } },
            ],
        });
        this.#computeBindGroupBDraw = this.#device.createBindGroup({
            layout: this.#computeBindGroupLayoutDraw,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 1, resource: { buffer: this.#uniformDrawBuffer } },
                { binding: 3, resource: { buffer: this.#bufferA } },
            ],
        });
        this.#renderBindGroupA = this.#device.createBindGroup({
            layout: this.#renderBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 2, resource: { buffer: this.#bufferA } },
            ],
        });
        this.#renderBindGroupB = this.#device.createBindGroup({
            layout: this.#renderBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.#uniformBuffer } },
                { binding: 2, resource: { buffer: this.#bufferB } },
            ],
        });
    }
    static setPaintPos(screenMouseX, screenMouseY) {
        const bbox = this.#canvas.getBoundingClientRect();
        const xpos = (screenMouseX - bbox.left) / bbox.width * this.WIDTH;
        const ypos = (screenMouseY - bbox.top) / bbox.height * this.HEIGHT;
        this.#device.queue.writeBuffer(this.#uniformDrawBuffer, 0, new Float32Array([xpos, ypos]));
    }
    static update(deltaTime) {
        for (let i = 0; i < 50; i++) {
            const commandEncoder = this.#device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.#computePipeline);
            computePass.setBindGroup(0, this.#step % 2 === 0 ? this.#computeBindGroupA : this.#computeBindGroupB);
            computePass.dispatchWorkgroups(Math.ceil(this.WIDTH / 8), Math.ceil(this.HEIGHT / 8));
            computePass.end();
            this.#device.queue.submit([commandEncoder.finish()]);
            this.#step++;
        }
        const commandEncoder = this.#device.createCommandEncoder();
        if (this.isDrawing) {
            const computePass2 = commandEncoder.beginComputePass();
            computePass2.setPipeline(this.#computePipelineDraw);
            computePass2.setBindGroup(0, this.#step % 2 === 0 ? this.#computeBindGroupADraw : this.#computeBindGroupBDraw);
            computePass2.dispatchWorkgroups(Math.ceil(this.WIDTH / 8), Math.ceil(this.HEIGHT / 8));
            computePass2.end();
        }
        const renderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.#context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };
        const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
        renderPass.setPipeline(this.#renderPipeline);
        renderPass.setBindGroup(0, this.#step % 2 === 0 ? this.#renderBindGroupB : this.#renderBindGroupA);
        renderPass.draw(6);
        renderPass.end();
        this.#device.queue.submit([commandEncoder.finish()]);
        this.#step++;
    }
    static async #getShaderCode(dir) {
        const response = await fetch(dir);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    }
}
