import {Node, Pod} from "kubernetes-types/core/v1";

const hasCrypto = 'crypto' in window;

function randomId(): string {
    if (hasCrypto) {
        let parts = window.crypto.randomUUID().split('-');
        return parts[0]
    } else {
        return Array(9).join((Math.random().toString(36) + '00000000000000000').slice(2, 18)).slice(0, 8)
    }
}

function makeNode(name: string, cpu: string, memory: string): Node {
    return {
        apiVersion: "v1",
        kind: "Node",
        metadata: {name},
        status: {
            capacity: {cpu, memory}
        }
    }
}

function makePod(nodeName: string, namespace: string, name: string, cpu: string, memory: string): Pod {
    return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
            namespace,
            name: `${name}-${randomId()}`
        },
        spec: {
            nodeName,
            containers: [
                {
                    name: name,
                    resources: {
                        requests: {cpu, memory}
                    }
                }
            ]
        }
    }
}

export const sampleNodes: Node[] = [
    makeNode("node-a", '64', '128Gi'),
    makeNode("node-b", '32', '64Gi'),
]

export const samplePods: Pod[] = [
    makePod("node-a", "kube-system", "coredns", '1', '512Mi'),
    makePod("node-a", "monitoring", "fluent-bit", '2', '1Gi'),
    makePod("node-a", "monitoring", "prometheus", '12', '36Gi'),
    makePod("node-a", "prod", "pet-store", '4', '16Gi'),
    makePod("node-a", "prod", "pet-store", '4', '16Gi'),
    makePod("node-a", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-a", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-a", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-a", "prod", "pet-clinic", '2', '4Gi'),


    makePod("node-b", "kube-system", "coredns", '1', '512Mi'),
    makePod("node-b", "monitoring", "fluent-bit", '2', '1Gi'),
    makePod("node-b", "prod", "pet-store", '4', '16Gi'),
    makePod("node-b", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-b", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-b", "prod", "pet-clinic", '2', '4Gi'),
    makePod("node-b", "prod", "pet-clinic", '2', '4Gi'),
];
