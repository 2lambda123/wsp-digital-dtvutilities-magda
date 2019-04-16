import React, { Component } from "react";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { connect } from "react-redux";
import { markdownToHtml } from "Components/Common/MarkdownViewer";
import "./StaticPage.scss";

import { fetchStaticPage } from "actions/staticPagesActions";
import { bindActionCreators } from "redux";

import starIcon from "assets/star.svg";

class StaticPage extends Component {
    componentDidMount() {
        if (this.props.match.params.pageId) {
            this.props.fetchStaticPage(this.props.match.params.pageId);
        }
    }

    componentDidUpdate(prevProps) {
        if (prevProps.match.params.pageId !== this.props.match.params.pageId) {
            this.props.fetchStaticPage(this.props.match.params.pageId);
        }
    }

    render() {
        const title = this.props.page.title;
        const contentRaw = this.props.page.content;

        const content = safeLoadFront(contentRaw);
        const bodyContent = content.__content;

        const breadcrumb = [
            <li key={0}>
                <span>{title}</span>
            </li>
        ];

        let html = markdownToHtml(bodyContent);

        // replace star emoji with star icon
        html = html.replace(/⭐/g, `<img src="${starIcon}" />`);

        return (
            <MagdaDocumentTitle prefixes={[title]}>
                <div
                    className={`static-page-container container page-${
                        this.props.path
                    }`}
                >
                    <Medium>
                        <Breadcrumbs breadcrumbs={breadcrumb} />
                    </Medium>
                    <h1> {title} </h1>
                    <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                            __html: html
                        }}
                    />
                </div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state, old) {
    const path = old.match.params.pageId;
    return {
        strings: state.content.strings,
        path,
        page: state.staticPages[path] || {
            title: "Loading...",
            content: "Loading..."
        }
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchStaticPage
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(StaticPage);
